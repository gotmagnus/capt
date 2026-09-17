"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav-config";
import { Logo } from "@/components/brand";
import { CompanySwitcher } from "./company-switcher";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface SidebarProps {
  companyId: string;
  companies: { id: string; name: string; role: string }[];
  badges: Record<string, number>;
  role: string;
}

function SidebarBody({ companyId, companies, badges, role, onNavigate, trailing }: SidebarProps & { onNavigate?: () => void; trailing?: React.ReactNode }) {
  const pathname = usePathname();
  const base = `/app/${companyId}`;
  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <Link href={`${base}/dashboard`} onClick={onNavigate}>
          <Logo light size={22} />
        </Link>
        {trailing}
      </div>
      <div className="px-3 pb-2">
        <CompanySwitcher companyId={companyId} companies={companies} />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin" aria-label="Workspace">
        {NAV.map((section, i) => (
          <div key={i} className={cn("mt-3", i === 0 && "mt-1")}>
            {section.title ? <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-muted">{section.title}</div> : null}
            <ul className="space-y-0.5">
              {section.items
                .filter((it) => !it.roles || it.roles.includes(role))
                .map((it) => {
                  const href = `${base}${it.href}`;
                  const active = pathname === href || pathname.startsWith(href + "/");
                  const badge = it.badgeKey ? badges[it.badgeKey] : 0;
                  return (
                    <li key={it.href}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60",
                          active ? "bg-sidebar-active text-sidebar-active-foreground font-medium" : "hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <it.icon className={cn("size-4 shrink-0", active ? "text-blue-300" : "text-sidebar-muted group-hover:text-slate-300")} />
                        <span className="truncate">{it.label}</span>
                        {badge ? <span className="ml-auto rounded-full bg-blue-500/20 px-1.5 text-[10px] font-semibold tabular text-blue-200">{badge}</span> : null}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-white/10 px-4 py-3 text-[11px] text-sidebar-muted">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
          <span className="truncate">SOC 2 Type II · All systems normal</span>
        </div>
      </div>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar text-sidebar-foreground no-print lg:flex">
      <SidebarBody {...props} />
    </aside>
  );
}

/** Hamburger + slide-over navigation for viewports below `lg`, where the fixed sidebar is hidden. */
export function MobileSidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="-ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden" aria-label="Open navigation">
        <Menu className="size-5" />
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="lg:hidden" />
        <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-[17.5rem] max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-2xl outline-none data-[state=open]:animate-drawer lg:hidden">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarBody
            {...props}
            onNavigate={() => setOpen(false)}
            trailing={
              <DialogClose className="flex size-8 items-center justify-center rounded-md text-sidebar-muted hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60" aria-label="Close navigation">
                <X className="size-4" />
              </DialogClose>
            }
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
