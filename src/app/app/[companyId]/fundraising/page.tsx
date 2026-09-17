import Link from "next/link";
import { ArrowRight, FileText, Plus, Rocket, ScanSearch, TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable, convertibles } from "@/lib/data/captable";
import { compactMoney, date, money, percent, price } from "@/lib/format";
import { PageHeader, Stat, Section, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { RoundDialog } from "./round-dialog";
import { ConvertiblesTable, type ConvertibleRow } from "./convertibles-table";

export const metadata = { title: "Fundraising" };

const TYPE_LABEL: Record<string, string> = { PRICED: "Priced", SAFE: "SAFE", CONVERTIBLE_NOTE: "Notes", BRIDGE: "Bridge", SECONDARY: "Secondary" };

export default async function FundraisingPage(props: PageProps<"/app/[companyId]/fundraising">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, rounds] = await Promise.all([loadCapTable(C), db.fundingRound.findMany({ where: { companyId: C }, include: { shareClass: true }, orderBy: [{ closeDate: "desc" }, { createdAt: "desc" }] })]);
  const s = data.summary;
  const closed = rounds.filter((r) => r.status === "CLOSED");
  const totalRaised = closed.reduce((a, r) => a + r.amountRaised, 0);
  const lastPriced = closed.filter((r) => r.pricePerShare).sort((a, b) => (b.closeDate?.getTime() ?? 0) - (a.closeDate?.getTime() ?? 0))[0];
  const implied = lastPriced?.pricePerShare ? lastPriced.pricePerShare * s.totals.fullyDilutedShares : null;
  const unconverted = s.totals.safePrincipal + s.totals.notePrincipal;
  const planned = rounds.find((r) => r.status !== "CLOSED" && r.preMoneyValuation);
  const convs = convertibles(data);
  const convRows: ConvertibleRow[] = convs.map((c) => {
    const sec = data.securities.find((x) => x.id === c.id)!;
    return { ...c, issueDate: sec.issueDate.toISOString(), certificateNumber: sec.certificateNumber, holderName: sec.stakeholder.name, maturityDate: sec.maturityDate?.toISOString() ?? null, status: sec.status };
  });
  const ordered = rounds.slice().sort((a, b) => {
    const ad = a.closeDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bd = b.closeDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return bd - ad;
  });

  return (
    <>
      <PageHeader
        title="Fundraising"
        description="Rounds, SAFEs and convertible notes — with live conversion math from the cap table."
        actions={
          <>
            <Button variant="secondary" className="flex-1 sm:flex-none" asChild>
              <Link href={`/app/${C}/fundraising/term-sheet`}>
                <ScanSearch /> Scan term sheet
              </Link>
            </Button>
            <Button variant="secondary" className="flex-1 sm:flex-none" asChild>
              <Link href={`/app/${C}/modeling`}>
                <TrendingUp /> Model a round
              </Link>
            </Button>
            {ctx.canEdit ? (
              <RoundDialog
                companyId={C}
                shareClasses={data.shareClasses}
                trigger={
                  <Button className="w-full sm:w-auto">
                    <Plus /> New round
                  </Button>
                }
              />
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total raised" value={compactMoney(totalRaised)} hint={`${closed.length} closed round${closed.length === 1 ? "" : "s"}`} />
        <Stat label="Last round price" value={price(lastPriced?.pricePerShare)} hint={lastPriced ? `${lastPriced.name} · ${date(lastPriced.closeDate)}` : "No priced round yet"} />
        <Stat label="Implied valuation" value={compactMoney(implied)} hint="Fully diluted × last preferred price" />
        <Stat label="Unconverted principal" value={compactMoney(unconverted)} hint={`${s.totals.safeCount} SAFE${s.totals.safeCount === 1 ? "" : "s"} · ${s.totals.noteCount} note${s.totals.noteCount === 1 ? "" : "s"}`} tone={unconverted > 0 ? "accent" : "default"} />
      </div>

      <Section title="Rounds" description="Closed rounds are derived from issued securities; planned rounds feed the modeler." className="mt-6">
        {ordered.length === 0 ? (
          <EmptyState icon={Rocket} title="No rounds yet" description="Plan your first financing round or issue a SAFE." />
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th className="max-sm:hidden">Type</th>
                  <th>Status</th>
                  <th className="max-sm:hidden">Close date</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right max-sm:hidden">Price / share</th>
                  <th className="text-right max-sm:hidden">Pre-money</th>
                  <th className="text-right max-sm:hidden">Post-money</th>
                  <th className="max-sm:hidden">Lead</th>
                  <th className="max-sm:hidden">Share class</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/${C}/fundraising/rounds/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      {/* Phones: type, date and valuation fold under the round name. */}
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {TYPE_LABEL[r.roundType] ?? r.roundType}
                        {r.closeDate ? ` · ${date(r.closeDate)}` : ""}
                        {r.preMoneyValuation ? ` · ${compactMoney(r.preMoneyValuation)} pre` : ""}
                      </div>
                    </td>
                    <td className="max-sm:hidden">
                      <Badge variant="outline">{TYPE_LABEL[r.roundType] ?? r.roundType}</Badge>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="text-muted-foreground max-sm:hidden">{date(r.closeDate)}</td>
                    <td className="num">
                      {r.status === "CLOSED" ? (
                        money(r.amountRaised)
                      ) : r.targetAmount ? (
                        <span className="text-muted-foreground">
                          <span className="sm:hidden">{compactMoney(r.targetAmount)}</span>
                          <span className="max-sm:hidden">{money(r.targetAmount)}</span> target
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num max-sm:hidden">{price(r.pricePerShare)}</td>
                    <td className="num max-sm:hidden">{compactMoney(r.preMoneyValuation)}</td>
                    <td className="num max-sm:hidden">{compactMoney(r.postMoneyValuation)}</td>
                    <td className="text-muted-foreground max-sm:hidden">{r.leadInvestor ?? "—"}</td>
                    <td className="max-sm:hidden">{r.shareClass?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Convertible instruments"
        description={convRows.length ? `${convRows.length} outstanding · ${money(unconverted)} principal` : "No outstanding SAFEs or notes."}
        className="mt-8"
        actions={
          ctx.canEdit ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/app/${C}/fundraising/safes/new`}>
                  <Plus /> New SAFE
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/app/${C}/fundraising/notes/new`}>
                  <Plus /> New note
                </Link>
              </Button>
            </div>
          ) : null
        }
      >
        {convRows.length ? (
          <ConvertiblesTable companyId={C} rows={convRows} preRoundFullyDiluted={s.totals.fullyDilutedShares} defaultPreMoney={planned?.preMoneyValuation ?? (lastPriced?.postMoneyValuation ? Math.round(lastPriced.postMoneyValuation * 2) : 20_000_000)} />
        ) : (
          <EmptyState icon={FileText} title="No convertible instruments" description="SAFEs and notes issued here show up on the cap table as unconverted principal and convert automatically when you close a priced round." action={ctx.canEdit ? <Button asChild><Link href={`/app/${C}/fundraising/safes/new`}>Issue a SAFE</Link></Button> : undefined} />
        )}
      </Section>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { href: `/app/${C}/modeling`, title: "Round modeler", body: "Pro-forma any priced round with pool top-ups and convertible conversion.", icon: TrendingUp },
          { href: `/app/${C}/modeling/exit`, title: "Exit waterfall", body: `Who gets what at any exit value, across ${data.shareClasses.filter((c) => c.type === "PREFERRED").length} preferred classes.`, icon: Rocket },
          { href: `/app/${C}/fundraising/term-sheet`, title: "Term sheet scanner", body: "Paste a term sheet and get every economic and control term benchmarked.", icon: ScanSearch },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-lg border border-border bg-card p-4 hover:border-border-strong">
            <c.icon className="size-4 text-accent" />
            <div className="mt-2 flex items-center gap-1 text-[13px] font-semibold">
              {c.title} <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{c.body}</p>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Ownership shown as of today: {percent(s.groups.find((g) => g.key === "investors")?.fullyDilutedPct ?? 0, 1)} held by investors on a fully diluted basis.</p>
    </>
  );
}
