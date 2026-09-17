import { requireWorkspace } from "@/lib/auth";
import { SettingsNav } from "@/components/settings-nav";

export default async function SettingsLayout({ children, params }: LayoutProps<"/app/[companyId]/settings">) {
  const { companyId } = await params;
  const ctx = await requireWorkspace(companyId);
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
      <SettingsNav companyId={ctx.company.id} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
