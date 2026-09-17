"use client";

import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, WORKSPACE_ROLES, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CompanySwitcher({ companyId, companies }: { companyId: string; companies: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const current = companies.find((c) => c.id === companyId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-left text-[13px] text-white hover:bg-white/10 focus:outline-none">
        <span className="flex size-6 items-center justify-center rounded bg-blue-500/30 text-[11px] font-bold text-blue-100">{current?.name.slice(0, 1) ?? "?"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium leading-tight">{current?.name ?? "Select company"}</span>
          <span className="block truncate text-[10.5px] text-sidebar-muted">{current ? ROLE_LABELS[current.role as Role] ?? current.role : ""}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Companies</DropdownMenuLabel>
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => router.push(WORKSPACE_ROLES.includes(c.role as Role) ? `/app/${c.id}/dashboard` : `/portal/${c.id}`)}
            className={cn(c.id === companyId && "bg-muted")}
          >
            <Building2 />
            <span className="flex-1 truncate">{c.name}</span>
            {c.id === companyId ? <Check className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/signup")}>
          <Plus /> Add a company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
