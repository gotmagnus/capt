import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { Logo } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { PROSE_FIXES } from "@/components/people-labels";

export const metadata = { title: "Company update" };

export default async function PublicUpdatePage(props: PageProps<"/u/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const update = await db.investorUpdate.findUnique({ where: { publicToken: token }, include: { company: true } });
  if (!update || update.status !== "PUBLISHED") notFound();
  const email = typeof sp.e === "string" ? sp.e.toLowerCase() : null;
  const stakeholder = email ? await db.stakeholder.findFirst({ where: { companyId: update.companyId, email } }) : null;
  await db.updateView.create({ data: { updateId: update.id, stakeholderId: stakeholder?.id ?? null, email: email ?? null } });
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={22} />
            <span className="truncate text-[13px] text-muted-foreground">{update.company.name}</span>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{date(update.publishedAt, "long")}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <article className="rounded-lg border border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
          <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">{update.title}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            From {update.company.name} · {date(update.publishedAt, "long")}
          </p>
          <hr className="my-5 border-border sm:my-6" />
          <Markdown content={update.body} className={`text-[14px] ${PROSE_FIXES}`} />
        </article>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">Confidential — shared with you by {update.company.legalName.replace(/\.$/, "")}. Please don't forward.</p>
      </main>
    </div>
  );
}
