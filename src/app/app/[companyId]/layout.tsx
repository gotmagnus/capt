import { requireWorkspace } from "@/lib/auth";
import { companyNav } from "@/lib/data/captable";
import { MobileSidebar, Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function CompanyLayout({ children, params }: LayoutProps<"/app/[companyId]">) {
  const { companyId } = await params;
  const ctx = await requireWorkspace(companyId);
  const badges = await companyNav(ctx.company.id);
  const companies = ctx.user.memberships.map((m) => ({ id: m.companyId, name: m.company.name, role: m.role }));
  const nav = { companyId: ctx.company.id, companies, badges, role: ctx.role };
  return (
    <div className="min-h-screen">
      <Sidebar {...nav} />
      <div className="lg:pl-60">
        <Topbar user={{ name: ctx.user.name, email: ctx.user.email }} companyId={ctx.company.id} openTasks={badges.openTasks} leading={<MobileSidebar {...nav} />} />
        <main className="mx-auto max-w-[1400px] px-4 py-5 animate-in sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
