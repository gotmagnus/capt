import { Check, Minus, UserPlus, X } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, relative } from "@/lib/format";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/types";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { FormDialog, ConfirmButton } from "@/components/forms";
import { RoleSelect } from "@/components/settings-role-select";
import { inviteUser, removeMember } from "../actions";

export const metadata = { title: "Users & permissions" };

const MATRIX: { capability: string; roles: Partial<Record<Role, "full" | "view" | "none" | "own">> }[] = [
  { capability: "Admin workspace (dashboard, cap table, reports)", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "view", VIEWER: "view", EMPLOYEE: "none", INVESTOR: "none" } },
  { capability: "Issue, cancel and transfer securities", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "none", VIEWER: "none", EMPLOYEE: "none", INVESTOR: "none" } },
  { capability: "Board consents & approvals", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "view", BOARD: "own", VIEWER: "view", EMPLOYEE: "none", INVESTOR: "none" } },
  { capability: "409A valuations & compliance", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "view", VIEWER: "view", EMPLOYEE: "none", INVESTOR: "none" } },
  { capability: "Documents & data room", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "view", VIEWER: "view", EMPLOYEE: "own", INVESTOR: "own" } },
  { capability: "Stakeholder portal (holdings, vesting, exercise)", roles: { ADMIN: "own", LEGAL: "own", FINANCE: "own", BOARD: "own", VIEWER: "own", EMPLOYEE: "own", INVESTOR: "own" } },
  { capability: "Investor updates & company ownership view", roles: { ADMIN: "full", LEGAL: "full", FINANCE: "full", BOARD: "view", VIEWER: "view", EMPLOYEE: "none", INVESTOR: "view" } },
  { capability: "Users, roles, billing, API keys", roles: { ADMIN: "full", LEGAL: "view", FINANCE: "view", BOARD: "none", VIEWER: "none", EMPLOYEE: "none", INVESTOR: "none" } },
];

export default async function UsersPage(props: PageProps<"/app/[companyId]/settings/users">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [memberships, stakeholders, logins] = await Promise.all([
    db.companyMembership.findMany({ where: { companyId: C }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.stakeholder.findMany({ where: { companyId: C }, select: { id: true, name: true, email: true, userId: true }, orderBy: { name: "asc" } }),
    db.auditLog.findMany({ where: { companyId: C, action: "LOGIN" }, orderBy: { createdAt: "desc" }, take: 200, select: { userId: true, createdAt: true } }),
  ]);
  const lastLogin = new Map<string, Date>();
  for (const l of logins) if (l.userId && !lastLogin.has(l.userId)) lastLogin.set(l.userId, l.createdAt);
  const stakeholderByUser = new Map(stakeholders.filter((s) => s.userId).map((s) => [s.userId as string, s]));
  const unlinked = stakeholders.filter((s) => !s.userId);
  const isAdmin = ctx.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="Users & permissions"
        description="Who can access this company and what they can do. Employees and investors get the stakeholder portal; admins, counsel and finance get the full workspace."
        actions={
          ctx.canEdit ? (
            <FormDialog
              trigger={
                <Button>
                  <UserPlus /> Invite user
                </Button>
              }
              title="Invite a user"
              description="They'll receive an email with sign-in instructions. New accounts get a temporary password shown once after inviting."
              action={inviteUser}
              hidden={{ companyId: C }}
              submitLabel="Send invite"
            >
              <Field label="Full name" required>
                <Input name="name" required placeholder="Jane Doe" />
              </Field>
              <Field label="Email" required>
                <Input name="email" type="email" required placeholder="jane@example.com" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="EMPLOYEE">
                  {ROLES.filter((r) => isAdmin || r !== "ADMIN").map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Link to stakeholder" hint="Connects the login to holdings so they see their equity in the portal. Matched by email automatically if left blank.">
                <Select name="stakeholderId" defaultValue="">
                  <option value="">Auto-match by email</option>
                  {unlinked.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.email ? ` (${s.email})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormDialog>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>{memberships.length} people have access</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Linked stakeholder</th>
                <th>Joined</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => {
                const sh = stakeholderByUser.get(m.userId);
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.user.name} size="sm" />
                        <div>
                          <div className="font-medium">
                            {m.user.name}
                            {m.userId === ctx.user.id ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{isAdmin ? <RoleSelect companyId={C} userId={m.userId} role={m.role} disabled={m.userId === ctx.user.id} /> : <Badge variant="outline">{ROLE_LABELS[m.role as Role] ?? m.role}</Badge>}</td>
                    <td className="text-muted-foreground">{sh ? sh.name : <span className="text-subtle">—</span>}</td>
                    <td className="text-muted-foreground">{date(m.createdAt)}</td>
                    <td className="text-muted-foreground">{lastLogin.has(m.userId) ? relative(lastLogin.get(m.userId)) : "Never"}</td>
                    <td className="text-right">
                      {isAdmin && m.userId !== ctx.user.id ? (
                        <ConfirmButton action={removeMember} hidden={{ companyId: C, userId: m.userId }} title={`Remove ${m.user.name}?`} description="They will lose access to this company immediately. Their stakeholder record and holdings are unaffected." variant="ghost" size="xs" confirmLabel="Remove access" successMessage="Member removed">
                          <X className="size-3.5" />
                        </ConfirmButton>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Permissions matrix</CardTitle>
            <CardDescription>What each role can see and do. Roles are per company; a person can hold different roles in different companies.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="max-sm:sticky max-sm:left-0 max-sm:z-[2] max-sm:border-r max-sm:border-border">Capability</th>
                  {ROLES.map((r) => (
                    <th key={r} className="text-center">
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.capability}>
                    <td className="max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:min-w-44 max-sm:whitespace-normal max-sm:border-r max-sm:border-border max-sm:bg-card">{row.capability}</td>
                    {ROLES.map((r) => {
                      const v = row.roles[r] ?? "none";
                      return (
                        <td key={r} className="text-center">
                          {v === "full" ? <Check className="mx-auto size-4 text-success" /> : v === "view" ? <span className="text-xs text-muted-foreground">View</span> : v === "own" ? <span className="text-xs text-accent-foreground">Own</span> : <Minus className="mx-auto size-4 text-subtle" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <Check className="inline size-3.5 text-success" /> full access · View = read-only · Own = only records linked to their stakeholder profile.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
