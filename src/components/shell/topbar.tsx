"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, HelpCircle, LogOut, Search, User } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/(auth)/actions";
import { Kbd } from "@/components/ui/misc";
import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./command-palette";

export function Topbar({
  user,
  companyId,
  openTasks,
  portal = false,
  leading,
}: {
  user: { name: string; email: string };
  companyId: string;
  openTasks: number;
  portal?: boolean;
  /** Rendered before the search trigger — the mobile navigation button. */
  leading?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className={portal ? "flex items-center gap-1 no-print" : "sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur no-print sm:gap-3 sm:px-6"}>
      {leading}
      {!portal ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Search stakeholders, securities and pages"
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:max-w-[26rem]"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            <span className="sm:hidden">Search…</span>
            <span className="hidden sm:inline">Search stakeholders, securities, pages…</span>
          </span>
          <span className="hidden shrink-0 sm:inline-flex">
            <Kbd>⌘K</Kbd>
          </span>
        </button>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={portal ? `/portal/${companyId}/help` : `/app/${companyId}/help`} aria-label="Help">
            <HelpCircle />
          </Link>
        </Button>
        <Button variant="ghost" size="icon-sm" asChild className="relative">
          <Link href={portal ? `/portal/${companyId}` : `/app/${companyId}/dashboard#tasks`} aria-label="Notifications">
            <Bell />
            {openTasks > 0 ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-card" /> : null}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-1 flex items-center gap-2 rounded-md p-1 hover:bg-muted focus:outline-none">
            <Avatar name={user.name} size="sm" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="text-[13px] font-medium text-foreground">{user.name}</div>
              <div className="text-xs font-normal">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push(portal ? `/portal/${companyId}/profile` : `/app/${companyId}/settings/profile`)}>
              <User /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => logout()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!portal ? <CommandPalette open={open} onOpenChange={setOpen} companyId={companyId} /> : null}
    </header>
  );
}
