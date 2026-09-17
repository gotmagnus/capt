import { cookies } from "next/headers";
import { requireWorkspace, SESSION_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime, relative } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { PasswordForm } from "@/components/settings-password-form";
import { signOutOtherSessions, updateProfile } from "../actions";

export const metadata = { title: "Profile" };

export default async function ProfilePage(props: PageProps<"/app/[companyId]/settings/profile">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const sessions = await db.session.findMany({ where: { userId: ctx.user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageHeader title="Profile" description="Your account across every company you belong to." />
      <div className="space-y-5">
        <Card>
          <CardHeader className="flex-col sm:flex-row">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={ctx.user.name} size="lg" />
              <div className="min-w-0">
                <CardTitle>{ctx.user.name}</CardTitle>
                <CardDescription className="truncate">{ctx.user.email}</CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 sm:justify-end">
              {ctx.user.memberships.map((m) => (
                <Badge key={m.id} variant="outline">
                  {m.company.name} · {ROLE_LABELS[m.role as Role] ?? m.role}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateProfile} hidden={{ companyId: C }} successMessage="Profile saved" className="grid gap-4 md:grid-cols-2">
              <Field label="Full name">
                <Input name="name" defaultValue={ctx.user.name} required />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" defaultValue={ctx.user.email} required />
              </Field>
              <div className="md:col-span-2 flex justify-end">
                <SubmitButton variant="secondary">Save</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Password</CardTitle>
              <CardDescription>Use at least 8 characters. Changing your password does not sign out other devices.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PasswordForm companyId={C} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sessions</CardTitle>
              <CardDescription>{sessions.length} active session{sessions.length === 1 ? "" : "s"}</CardDescription>
            </div>
            {sessions.length > 1 ? (
              <ConfirmButton action={signOutOtherSessions} hidden={{ companyId: C }} title="Sign out other sessions?" description="Every device except this one will need to sign in again." variant="secondary" size="sm" confirmLabel="Sign out others" successMessage="Other sessions signed out">
                Sign out other sessions
              </ConfirmButton>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Started</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <code className="font-mono text-xs">{s.token.slice(0, 8)}…</code>
                      {s.token === currentToken ? <Badge variant="success" className="ml-2">This device</Badge> : null}
                    </td>
                    <td className="text-muted-foreground">{dateTime(s.createdAt)}</td>
                    <td className="text-muted-foreground">{relative(s.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
