/**
 * Heuristic term sheet scanner. Extracts the economic and control terms most founders
 * negotiate and flags anything outside market norms for a Seed / Series A round.
 */

export interface ExtractedTerm {
  key: string;
  label: string;
  value: string | null;
  raw?: string;
  standard: string;
  status: "OK" | "WARNING" | "DANGER" | "UNKNOWN" | "INFO";
  explanation?: string;
}

export interface TermSheetScan {
  terms: ExtractedTerm[];
  flags: { severity: "WARNING" | "DANGER" | "INFO"; title: string; detail: string }[];
  score: number; // 0-100 founder-friendliness
  summaryMarkdown: string;
}

function parseMoney(num: string, unit?: string): number | null {
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const u = (unit ?? "").toLowerCase();
  if (u.startsWith("b")) return n * 1e9;
  if (u.startsWith("m")) return n * 1e6;
  if (u.startsWith("k")) return n * 1e3;
  return n;
}

function money(n: number | null) {
  if (n == null) return null;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 4 : 0 })}`;
}

const MONEY_RE = String.raw`\$\s?([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|[bmk]{1}\b)?`;

function findMoney(text: string, labels: RegExp[]): { value: number | null; raw?: string } {
  for (const label of labels) {
    const re = new RegExp(`${label.source}[^$\\n]{0,60}${MONEY_RE}`, "i");
    const m = text.match(re);
    if (m) return { value: parseMoney(m[1], m[2]), raw: m[0].trim() };
  }
  return { value: null };
}

function sentenceWith(text: string, re: RegExp): string | undefined {
  const sentences = text.split(/(?<=[.;\n])\s+/);
  return sentences.find((s) => re.test(s))?.trim();
}

export function extractTerms(text: string): TermSheetScan {
  const t = text.replace(/\r/g, "");
  const terms: ExtractedTerm[] = [];
  const flags: TermSheetScan["flags"] = [];
  let score = 100;

  // Amount raised
  const amount = findMoney(t, [/(?:amount|aggregate|total)\s+(?:of\s+)?(?:financing|raised|investment|proceeds)/, /(?:financing|investment)\s+amount/, /raise(?:d|s)?/, /amount/]);
  terms.push({ key: "amount", label: "Amount raised", value: money(amount.value), raw: amount.raw, standard: "—", status: amount.value ? "INFO" : "UNKNOWN" });

  // Valuation
  const pre = findMoney(t, [/pre-?\s?money(?:\s+valuation)?/]);
  const post = findMoney(t, [/post-?\s?money(?:\s+valuation)?/]);
  terms.push({ key: "preMoney", label: "Pre-money valuation", value: money(pre.value), raw: pre.raw, standard: "Fully diluted, including unallocated pool", status: pre.value ? "INFO" : "UNKNOWN" });
  terms.push({ key: "postMoney", label: "Post-money valuation", value: money(post.value ?? (pre.value && amount.value ? pre.value + amount.value : null)), raw: post.raw, standard: "Pre-money + new money", status: post.value || pre.value ? "INFO" : "UNKNOWN" });

  // Price per share
  const pps = findMoney(t, [/(?:original\s+issue\s+)?price\s+per\s+share/, /purchase\s+price/]);
  terms.push({ key: "pps", label: "Price per share", value: money(pps.value), raw: pps.raw, standard: "Pre-money ÷ fully diluted shares", status: pps.value ? "INFO" : "UNKNOWN" });

  // Liquidation preference
  const liqSentence = sentenceWith(t, /liquidation\s+preference/i) ?? "";
  const mult = liqSentence.match(/(\d+(?:\.\d+)?)\s*x/i);
  const multiple = mult ? Number(mult[1]) : liqSentence ? 1 : null;
  const nonParticipating = /non-?\s?participating/i.test(liqSentence);
  const participating = !nonParticipating && /participating/i.test(liqSentence);
  const capMatch = liqSentence.match(/cap(?:ped)?\s+(?:at\s+)?(\d+(?:\.\d+)?)\s*x/i);
  const liqStatus = multiple == null ? "UNKNOWN" : multiple > 1 ? "DANGER" : participating ? (capMatch ? "WARNING" : "DANGER") : "OK";
  terms.push({
    key: "liqPref",
    label: "Liquidation preference",
    value: multiple == null ? null : `${multiple}x ${participating ? `participating${capMatch ? ` (capped at ${capMatch[1]}x)` : " (uncapped)"}` : "non-participating"}`,
    raw: liqSentence || undefined,
    standard: "1x non-participating",
    status: liqStatus,
    explanation: multiple != null && multiple > 1 ? "Investors get more than their money back before common sees anything." : participating ? "Investors receive their preference and then share pro-rata with common — 'double dipping'." : undefined,
  });
  if (multiple != null && multiple > 1) {
    flags.push({ severity: "DANGER", title: `${multiple}x liquidation preference`, detail: "Anything above 1x is off-market for early-stage rounds and compounds across future rounds. Push for 1x." });
    score -= 25;
  }
  if (participating) {
    flags.push({ severity: capMatch ? "WARNING" : "DANGER", title: `Participating preferred${capMatch ? ` capped at ${capMatch[1]}x` : " (uncapped)"}`, detail: capMatch ? "Capped participation is negotiable but still dilutes common outcomes in mid-range exits." : "Uncapped participation materially reduces common proceeds in every exit. Market standard is non-participating." });
    score -= capMatch ? 10 : 20;
  }
  if (/senior\s+to/i.test(liqSentence) || /senior/i.test(liqSentence)) {
    terms.push({ key: "seniority", label: "Seniority", value: /pari\s+passu/i.test(liqSentence) ? "Pari passu with prior preferred" : "Senior to prior preferred", standard: "Senior to prior rounds (standard) or pari passu", status: "INFO" });
  }

  // Dividends
  const divSentence = sentenceWith(t, /dividend/i) ?? "";
  const divRate = divSentence.match(/(\d+(?:\.\d+)?)\s*%/);
  const cumulative = /(?<!non-)(?<!non )cumulative/i.test(divSentence) && !/non-?\s?cumulative/i.test(divSentence);
  terms.push({
    key: "dividends",
    label: "Dividends",
    value: divSentence ? `${divRate ? `${divRate[1]}% ` : ""}${cumulative ? "cumulative" : "non-cumulative"}${/when\s+and\s+(?:if|as)\s+declared/i.test(divSentence) ? ", when and if declared" : ""}` : null,
    raw: divSentence || undefined,
    standard: "6–8% non-cumulative, when and if declared",
    status: !divSentence ? "UNKNOWN" : cumulative ? "WARNING" : "OK",
    explanation: cumulative ? "Cumulative dividends accrue whether or not declared and are added to the liquidation preference." : undefined,
  });
  if (cumulative) {
    flags.push({ severity: "WARNING", title: "Cumulative dividends", detail: "Accruing dividends silently grow the preference stack every year. Ask for non-cumulative, payable only when declared." });
    score -= 10;
  }

  // Anti-dilution
  const adSentence = sentenceWith(t, /anti-?\s?dilution/i) ?? "";
  const antiDilution = /full\s+ratchet/i.test(adSentence) ? "Full ratchet" : /narrow-?\s?based/i.test(adSentence) ? "Narrow-based weighted average" : /broad-?\s?based|weighted\s+average/i.test(adSentence) ? "Broad-based weighted average" : adSentence ? "Unspecified" : null;
  terms.push({
    key: "antiDilution",
    label: "Anti-dilution",
    value: antiDilution,
    raw: adSentence || undefined,
    standard: "Broad-based weighted average",
    status: antiDilution == null ? "UNKNOWN" : antiDilution === "Full ratchet" ? "DANGER" : antiDilution.startsWith("Narrow") ? "WARNING" : "OK",
    explanation: antiDilution === "Full ratchet" ? "A down round reprices every share to the new price regardless of size — extremely punitive to founders and employees." : undefined,
  });
  if (antiDilution === "Full ratchet") {
    flags.push({ severity: "DANGER", title: "Full-ratchet anti-dilution", detail: "Off-market. Insist on broad-based weighted average protection." });
    score -= 20;
  } else if (antiDilution?.startsWith("Narrow")) {
    flags.push({ severity: "WARNING", title: "Narrow-based anti-dilution", detail: "Narrow-based formulas exclude options and convertibles from the denominator, giving investors more protection than the standard broad-based formula." });
    score -= 5;
  }

  // Option pool
  const poolSentence = sentenceWith(t, /(?:option|equity|stock)\s+(?:pool|plan|incentive)|unallocated/i) ?? "";
  const poolPct = poolSentence.match(/(\d+(?:\.\d+)?)\s*%/);
  const poolValue = poolPct ? Number(poolPct[1]) : null;
  const poolPre = /pre-?\s?money|prior\s+to\s+(?:the\s+)?closing|included\s+in\s+the\s+pre/i.test(poolSentence);
  terms.push({
    key: "pool",
    label: "Option pool",
    value: poolValue != null ? `${poolValue}% ${poolPre ? "post-money, created in the pre-money" : "post-money"}` : poolSentence ? "Mentioned, size unclear" : null,
    raw: poolSentence || undefined,
    standard: "10% post-money, sized to the 12–18 month hiring plan",
    status: poolValue == null ? "UNKNOWN" : poolValue > 15 ? "WARNING" : "OK",
    explanation: poolPre ? "A pool created in the pre-money dilutes only existing holders — the 'option pool shuffle' effectively lowers the pre-money valuation." : undefined,
  });
  if (poolValue != null && poolValue > 15) {
    flags.push({ severity: "WARNING", title: `${poolValue}% option pool`, detail: "Pools above 15% are usually larger than the hiring plan needs; every excess point is founder dilution. Negotiate the pool down to the actual plan." });
    score -= 8;
  } else if (poolPre && poolValue != null) {
    flags.push({ severity: "INFO", title: "Pool top-up in the pre-money", detail: "Standard, but model the effective pre-money after the pool: the investors' price already reflects the new options." });
  }

  // Board
  const boardSentence = sentenceWith(t, /board\s+(?:of\s+directors|composition|seats?)/i) ?? sentenceWith(t, /\bboard\b[^.\n]*(?:\d|one|two|three)[^.\n]*(?:founder|investor|independent|member|seat)/i) ?? "";
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const NUM = "(\\d+|one|two|three|four|five|six|seven)";
  const count = (re: RegExp) => {
    const m = boardSentence.match(re);
    if (!m) return 0;
    const raw = m[1].toLowerCase();
    return WORDS[raw] ?? Number(raw);
  };
  const founderSeats = count(new RegExp(`${NUM}\\s+(?:seats?\\s+|members?\\s+|directors?\\s+)?(?:designated|appointed|elected|nominated)?\\s*(?:by\\s+)?(?:the\\s+)?(?:founders?|common)`, "i")) || count(/(?:founders?|common)[^.\d]{0,20}(\d+)/i);
  const investorSeats = count(new RegExp(`${NUM}\\s+(?:seats?\\s+|members?\\s+|directors?\\s+)?(?:designated|appointed|elected|nominated)?\\s*(?:by\\s+)?(?:the\\s+)?(?:investors?|preferred|series|lead)`, "i")) || count(/(?:investors?|preferred|series\s+\w+)[^.\d]{0,20}(\d+)/i);
  const independentSeats = count(new RegExp(`${NUM}\\s+independent`, "i")) || count(/independent[^.\d]{0,20}(\d+)/i);
  const totalSeats = founderSeats + investorSeats + independentSeats;
  terms.push({
    key: "board",
    label: "Board composition",
    value: totalSeats ? `${founderSeats} founder / ${investorSeats} investor / ${independentSeats} independent` : boardSentence ? "Mentioned, composition unclear" : null,
    raw: boardSentence || undefined,
    standard: "Founders retain control or balanced with an independent (e.g. 2/1/1 or 2/2/1)",
    status: !totalSeats ? "UNKNOWN" : investorSeats > founderSeats + independentSeats ? "DANGER" : investorSeats >= founderSeats ? "WARNING" : "OK",
  });
  if (totalSeats && investorSeats > founderSeats + independentSeats) {
    flags.push({ severity: "DANGER", title: "Investor board majority", detail: "Investors would control the board and could replace management. Ask for a founder or independent majority." });
    score -= 20;
  } else if (totalSeats && investorSeats >= founderSeats) {
    flags.push({ severity: "WARNING", title: "Investors match founders on the board", detail: "Control hinges on the independent seat. Make sure founders have a say in choosing the independent director." });
    score -= 5;
  }

  // Rights & covenants
  const proRata = /pro[-\s]?rata/i.test(t);
  terms.push({ key: "proRata", label: "Pro-rata rights", value: proRata ? (/major\s+investor/i.test(t) ? "Major investors" : "Yes") : null, standard: "Major investors only", status: proRata ? "OK" : "UNKNOWN" });
  const drag = /drag[-\s]?along/i.test(t);
  terms.push({ key: "dragAlong", label: "Drag-along", value: drag ? "Yes" : null, standard: "Yes, with majority of common + preferred + board approval", status: drag ? (/board/i.test(sentenceWith(t, /drag[-\s]?along/i) ?? "") ? "OK" : "INFO") : "UNKNOWN" });
  const noShop = sentenceWith(t, /no[-\s]?shop|exclusivity/i) ?? "";
  const noShopDays = noShop.match(/(\d+)\s*days?/i);
  terms.push({ key: "noShop", label: "No-shop / exclusivity", value: noShop ? `${noShopDays ? `${noShopDays[1]} days` : "Yes"}` : null, raw: noShop || undefined, standard: "30–45 days", status: !noShop ? "UNKNOWN" : noShopDays && Number(noShopDays[1]) > 45 ? "WARNING" : "OK" });
  if (noShopDays && Number(noShopDays[1]) > 45) {
    flags.push({ severity: "WARNING", title: `${noShopDays[1]}-day no-shop`, detail: "Long exclusivity leaves you without leverage if the deal stalls. Cap it at 30–45 days with a clear closing timeline." });
    score -= 5;
  }
  const redemption = /redemption\s+rights?/i.test(t) && !/no\s+redemption/i.test(t);
  terms.push({ key: "redemption", label: "Redemption rights", value: redemption ? "Yes" : /no\s+redemption/i.test(t) ? "None" : null, standard: "None", status: redemption ? "WARNING" : /no\s+redemption/i.test(t) ? "OK" : "UNKNOWN" });
  if (redemption) {
    flags.push({ severity: "WARNING", title: "Redemption rights", detail: "Lets investors demand their money back after a period — rarely exercised but a real overhang. Push to remove." });
    score -= 8;
  }
  const protective = /protective\s+provisions/i.test(t);
  terms.push({ key: "protective", label: "Protective provisions", value: protective ? "Yes" : null, standard: "Standard NVCA list; avoid budget/hiring vetoes", status: protective ? (/budget|hiring|compensation/i.test(sentenceWith(t, /protective\s+provisions/i) ?? "") ? "WARNING" : "OK") : "UNKNOWN" });
  const founderVesting = sentenceWith(t, /founder(?:s')?\s+(?:vesting|shares?)/i);
  if (founderVesting) {
    const reVest = /re-?vest|reset/i.test(founderVesting);
    terms.push({ key: "founderVesting", label: "Founder vesting", value: reVest ? "Re-vesting required" : "Referenced", raw: founderVesting, standard: "Credit for time served; no full reset", status: reVest ? "WARNING" : "INFO" });
    if (reVest) {
      flags.push({ severity: "WARNING", title: "Founder re-vesting", detail: "Investors want founders to re-earn shares. Negotiate credit for time already served and double-trigger acceleration." });
      score -= 8;
    }
  }
  const infoRights = /information\s+rights/i.test(t);
  terms.push({ key: "infoRights", label: "Information rights", value: infoRights ? "Yes" : null, standard: "Major investors: quarterly financials, annual budget", status: infoRights ? "OK" : "UNKNOWN" });

  const found = terms.filter((x) => x.value).length;
  score = Math.max(0, Math.min(100, score));
  const summaryMarkdown = `# Term sheet scan\n\n**Founder-friendliness score:** ${score}/100 · ${found} of ${terms.length} terms detected\n\n| Term | Found | Market standard | Status |\n|---|---|---|---|\n${terms.map((x) => `| ${x.label} | ${x.value ?? "—"} | ${x.standard} | ${x.status} |`).join("\n")}\n\n${flags.length ? `## Flags\n\n${flags.map((f) => `- **${f.severity}: ${f.title}** — ${f.detail}`).join("\n")}` : "No atypical terms detected."}`;

  return { terms, flags, score, summaryMarkdown };
}
