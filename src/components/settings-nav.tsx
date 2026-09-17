"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, CreditCard, Database, Plug, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveTabScroll } from "@/components/ui/use-active-tab-scroll";

export function SettingsNav({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const strip = useRef<HTMLUListElement>(null);
  useActiveTabScroll(strip, pathname);
  const base = `/app/${companyId}/settings`;
  const items = [
    { label: "Company", href: base, icon: Building2 },
    { label: "Users & permissions", href: `${base}/users`, icon: Users },
    { label: "Integrations", href: `${base}/integrations`, icon: Plug },
    { label: "Billing & plan", href: `${base}/billing`, icon: CreditCard },
    { label: "Data", href: `${base}/data`, icon: Database },
    { label: "Notifications", href: `${base}/notifications`, icon: Bell },
    { label: "Profile", href: `${base}/profile`, icon: User },
  ];
  return (
    <nav className="min-w-0 lg:w-52 lg:shrink-0" aria-label="Settings">
      <div className="mb-3 hidden px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:block">Settings</div>
      <ul ref={strip} className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0">
        {items.map((it) => {
          const active = it.href === base ? pathname === base : pathname.startsWith(it.href);
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[13px] transition-colors lg:px-2",
                  active ? "border-border bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.06)]" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <it.icon className="size-4 shrink-0" />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
