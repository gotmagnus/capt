import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/forms";
import { saveNotificationPrefs } from "../actions";

export const metadata = { title: "Notifications" };

const EVENTS: { id: string; label: string; description: string }[] = [
  { id: "EXERCISE_REQUEST", label: "Exercise requests", description: "An employee requests to exercise options." },
  { id: "SIGNATURE", label: "Signatures", description: "An agreement or consent is signed or declined." },
  { id: "CONSENT_APPROVED", label: "Board approvals", description: "A board consent reaches the required approvals." },
  { id: "VALUATION", label: "409A status", description: "A valuation draft is delivered or is about to expire." },
  { id: "VESTING", label: "Vesting milestones", description: "Cliffs reached and grants fully vested." },
  { id: "DEADLINE", label: "Compliance deadlines", description: "83(b) windows, Form 3921 due dates and Rule 701 thresholds." },
  { id: "OFFER", label: "Offer letters", description: "Candidates view, accept or decline offers." },
  { id: "HRIS", label: "HRIS changes", description: "New hires and terminations detected by a connected HRIS." },
];

export default async function NotificationsPage(props: PageProps<"/app/[companyId]/settings/notifications">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const prefs = parseJson<{ notifications?: { digest?: string; slack?: boolean; events?: string[] } }>(ctx.company.settings, {}).notifications ?? {};
  const events = new Set(prefs.events ?? EVENTS.map((e) => e.id));
  const slack = await db.integration.findFirst({ where: { companyId: C, provider: "SLACK", status: "CONNECTED" } });

  return (
    <>
      <PageHeader title="Notifications" description="Choose what the workspace notifies admins, counsel and finance about, and where." />
      <ActionForm action={saveNotificationPrefs} hidden={{ companyId: C }} successMessage="Preferences saved">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Channels</CardTitle>
                <CardDescription>In-app tasks are always on. Email and Slack are optional.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Email digest">
                <Select name="digest" defaultValue={prefs.digest ?? "DAILY"} disabled={!ctx.canEdit}>
                  <option value="NONE">Off</option>
                  <option value="DAILY">Daily summary</option>
                  <option value="WEEKLY">Weekly summary</option>
                </Select>
              </Field>
              <Field label="Slack" hint={slack ? "Posting to the channel configured in Integrations." : "Connect Slack under Integrations to enable."}>
                <label className="flex h-9 items-center gap-2 text-[13px]">
                  <input type="checkbox" name="slack" defaultChecked={!!prefs.slack && !!slack} disabled={!slack || !ctx.canEdit} className="size-4 accent-blue-600" /> Send event notifications to Slack
                </label>
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Events</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {EVENTS.map((e) => (
                <label key={e.id} className="flex items-start gap-3 py-2.5 text-[13px] sm:items-center">
                  <input type="checkbox" name="events" value={e.id} defaultChecked={events.has(e.id)} disabled={!ctx.canEdit} className="mt-0.5 size-4 shrink-0 accent-blue-600 sm:mt-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium sm:inline">{e.label}</span>
                    <span className="text-muted-foreground sm:ml-2">{e.description}</span>
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>
          {ctx.canEdit ? (
            <div className="flex justify-end">
              <SubmitButton>Save preferences</SubmitButton>
            </div>
          ) : null}
        </div>
      </ActionForm>
    </>
  );
}
