import Link from "next/link";
import { requireCompany } from "@/lib/auth";
import { Topbar } from "@/components/shell/topbar";
import { Logo } from "@/components/brand";
import { PortalNav } from "./portal-nav";

export default async function PortalLayout({ children, params }: LayoutProps<"/portal/[companyId]">) {
  const { companyId } = await params;
  const ctx = await requireCompany(companyId);
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href={`/portal/${ctx.company.id}`} className="shrink-0 py-3">
            <Logo size={22} />
          </Link>
          <span className="min-w-0 truncate text-[13px] text-muted-foreground">{ctx.company.name}</span>
          <div className="ml-auto flex shrink-0 items-center">
            <Topbar user={{ name: ctx.user.name, email: ctx.user.email }} companyId={ctx.company.id} openTasks={0} portal />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <PortalNav companyId={ctx.company.id} isWorkspace={ctx.isWorkspace} role={ctx.role} />
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-4 py-5 animate-in sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
