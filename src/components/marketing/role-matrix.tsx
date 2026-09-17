"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Level = "full" | "view" | "own" | "none";

// Mirrors the permission matrix the product shows under Settings → Users & permissions.
const ROLES = [
  { key: "ADMIN", label: "Founder", note: "Runs the whole workspace: issues equity, closes rounds, invites everyone else." },
  { key: "LEGAL", label: "Counsel", note: "Your law firm works in the same ledger. They draft consents, issue securities and keep the data room." },
  { key: "FINANCE", label: "Finance", note: "Owns 409A, ASC 718 and Rule 701, and can issue and cancel securities." },
  { key: "BOARD", label: "Board member", note: "Reads the cap table and signs the consents addressed to them. Nothing else can be changed." },
  { key: "EMPLOYEE", label: "Employee", note: "Sees only their own grants, vesting, exercise costs, tax estimates and documents." },
  { key: "INVESTOR", label: "Investor", note: "Sees their own holdings and documents, the ownership summary and the updates you send." },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];

const MATRIX: { capability: string; roles: Record<RoleKey, Level> }[] = [
  { capability: "Dashboard, cap table and reports", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "view", EMPLOYEE: "none", INVESTOR: "none" } },
  { capability: "Issue, cancel and transfer securities", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "none", EMPLOYEE: "none", INVESTOR: "none" } },
  { capability: "Board consents and approvals", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "view", BOARD: "own", EMPLOYEE: "none", INVESTOR: "none" } },
  { capability: "409A valuations and compliance", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "view", EMPLOYEE: "none", INVESTOR: "none" } },
  { capability: "Documents and data room", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "view", EMPLOYEE: "own", INVESTOR: "own" } },
  { capability: "Own holdings, vesting and exercise", roles: { ADMIN: "own", LEGAL: "own", FINANCE: "own", BOARD: "own", EMPLOYEE: "own", INVESTOR: "own" } },
  { capability: "Investor updates and ownership summary", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "view", EMPLOYEE: "none", INVESTOR: "view" } },
  { capability: "Users, roles, billing and API keys", roles: { ADMIN: "full", LEGAL: "view", FINANCE: "view", BOARD: "none", EMPLOYEE: "none", INVESTOR: "none" } },
];

const LEVEL_LABEL: Record<Level, string> = { full: "Can edit", view: "Can view", own: "Their own only", none: "No access" };

function Mark({ level, lit }: { level: Level; lit: boolean }) {
  const tone = lit ? "bg-ink border-ink" : "bg-ink/25 border-ink/25";
  return (
    <span className="inline-flex size-4 items-center justify-center" title={LEVEL_LABEL[level]}>
      {level === "full" ? <span className={cn("size-3 rounded-full border", tone)} /> : null}
      {level === "view" ? <span className={cn("size-3 rounded-full border bg-transparent", lit ? "border-ink" : "border-ink/30")} /> : null}
      {level === "own" ? <span className={cn("size-3 rounded-full border bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]", lit ? "border-ink text-ink" : "border-ink/30 text-ink/30")} /> : null}
      {level === "none" ? <span className={cn("h-px w-2.5", lit ? "bg-ink/40" : "bg-ink/15")} /> : null}
      <span className="sr-only">{LEVEL_LABEL[level]}</span>
    </span>
  );
}

export function RoleMatrix() {
  const [role, setRole] = useState<RoleKey>("BOARD");
  const current = ROLES.find((r) => r.key === role)!;
  return (
    <div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Role">
        {ROLES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={role === r.key}
            onClick={() => setRole(r.key)}
            className={cn("h-9 shrink-0 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", role === r.key ? "border-ink bg-ink text-white" : "border-rule bg-white text-ink hover:border-ink/40")}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="mt-6 min-h-[3.5rem] max-w-2xl text-[1.0625rem] leading-relaxed text-ink" aria-live="polite">
        {current.note}
      </p>

      {/* Phones: just the chosen role, as a list. */}
      <ul className="mt-6 border-b border-rule md:hidden">
        {MATRIX.map((m) => {
          const level = m.roles[role];
          return (
            <li key={m.capability} className={cn("flex items-center justify-between gap-4 border-t border-rule py-3 text-[0.9375rem]", level === "none" && "text-muted-foreground")}>
              <span>{m.capability}</span>
              <span className="flex shrink-0 items-center gap-2 text-[0.8125rem]">
                {LEVEL_LABEL[level]}
                <Mark level={level} lit />
              </span>
            </li>
          );
        })}
      </ul>

      {/* Wider screens: the whole matrix, with the chosen column lit. */}
      <div className="mt-6 hidden md:block">
        <table className="w-full border-collapse text-[0.9375rem]">
          <thead>
            <tr>
              <th className="w-[34%] pb-3 text-left text-xs font-normal text-muted-foreground">What they can reach</th>
              {ROLES.map((r) => (
                <th key={r.key} className={cn("pb-3 text-center text-xs font-normal transition-colors", r.key === role ? "text-ink" : "text-muted-foreground")}>
                  <button type="button" tabIndex={-1} onClick={() => setRole(r.key)} className="w-full">
                    {r.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((m) => (
              <tr key={m.capability} className="border-t border-rule">
                <td className="py-3.5 pr-4 text-ink">{m.capability}</td>
                {ROLES.map((r) => (
                  <td key={r.key} className={cn("py-3.5 text-center transition-colors duration-200", r.key === role && "bg-vellum")}>
                    <Mark level={m.roles[r.key]} lit={r.key === role} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          {(["full", "view", "own", "none"] as Level[]).map((l) => (
            <span key={l} className="flex items-center gap-2">
              <Mark level={l} lit /> {LEVEL_LABEL[l]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
