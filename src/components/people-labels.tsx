/** Display labels for people-area enums that have no map in `src/lib/types.ts`. Plain module (no "use client") so server pages can import it too. */

export const EXERCISE_METHOD_LABELS: Record<string, string> = {
  ACH: "ACH debit",
  WIRE: "Wire transfer",
  CHECK: "Check",
  CASHLESS: "Cashless (sell-to-cover)",
  NET_EXERCISE: "Net exercise",
};

export function exerciseMethodLabel(method: string | null | undefined) {
  if (!method) return "—";
  return EXERCISE_METHOD_LABELS[method] ?? method.charAt(0) + method.slice(1).toLowerCase().replace(/_/g, " ");
}

/**
 * Extra classes for `<Markdown>` bodies in this area. Tailwind's preflight strips list markers and
 * `.prose-doc` does not restore them, a leading heading adds a gap at the top of its card, and
 * header-less markdown tables render an empty grey header bar.
 */
export const PROSE_FIXES = "[&>*:first-child]:mt-0 [&_ol]:list-decimal [&_ul]:list-disc [&_thead:not(:has(th:not(:empty)))]:hidden";

export const VALUATION_METHOD_LABELS: Record<string, string> = {
  BACKSOLVE: "Backsolve",
  OPM: "OPM",
  PWERM: "PWERM",
  HYBRID: "Hybrid (OPM + PWERM)",
  MARKET: "Market approach",
  INCOME: "Income approach",
  ASSET: "Asset approach",
};

/** Plain-text teaser of a markdown body: skips headings and table rows, strips emphasis and list markers, keeps hyphenated words. */
export function markdownPreview(body: string, max = 200) {
  return body
    .split("\n")
    .map((l) => l.trim().replace(/^([-*+]|\d+\.)\s+/, ""))
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("|"))
    .join(" ")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
