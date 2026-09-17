"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabItemClass } from "@/components/ui/tab-styles";
import { useActiveTabScroll } from "@/components/ui/use-active-tab-scroll";

export function PortalNav({ companyId, isWorkspace, role }: { companyId: string; isWorkspace: boolean; role: string }) {
  const pathname = usePathname();
  const strip = useRef<HTMLElement>(null);
  useActiveTabScroll(strip, pathname);
  const base = `/portal/${companyId}`;
  const items = [
    { label: "Overview", href: base },
    { label: "Holdings", href: `${base}/holdings` },
    { label: "Vesting", href: `${base}/vesting` },
    ...(role === "INVESTOR" || role === "BOARD" ? [{ label: "Ownership", href: `${base}/ownership` }] : []),
    { label: "Exercise simulator", href: `${base}/exercise` },
    { label: "Documents", href: `${base}/documents` },
    { label: "Tax center", href: `${base}/tax` },
    { label: "Updates", href: `${base}/updates` },
  ];
  return (
    <nav ref={strip} className="-mx-4 flex items-center gap-5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0" aria-label="Portal">
      {items.map((it) => {
        const active = it.href === base ? pathname === base : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined} className={tabItemClass(active)}>
            {it.label}
          </Link>
        );
      })}
      {isWorkspace ? (
        <Link href={`/app/${companyId}/dashboard`} className="ml-auto shrink-0 whitespace-nowrap pb-2.5 pt-1 pl-4 text-[13px] text-accent-foreground hover:underline">
          Open admin workspace →
        </Link>
      ) : null}
    </nav>
  );
}
