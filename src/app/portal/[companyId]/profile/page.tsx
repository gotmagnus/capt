import { requireCompany } from "@/lib/auth";
import { loadPortal } from "@/lib/portal-data";
import { date } from "@/lib/format";
import { RELATIONSHIP_LABELS, type StakeholderRelationship } from "@/lib/types";
import { PageHeader, DescriptionList } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/forms";
import { NoHoldings } from "../no-holdings";
import { updatePortalProfile } from "../actions";

export const metadata = { title: "Profile" };

const COUNTRIES = ["US", "CA", "GB", "DE", "FR", "NL", "SE", "CH", "IE", "ES", "IT", "AU", "NZ", "SG", "IN", "JP", "BR", "MX", "IL", "AE"];

export default async function PortalProfilePage(props: PageProps<"/portal/[companyId]/profile">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;
  const primary = p.myStakeholders.find((s) => s.type === "INDIVIDUAL") ?? p.myStakeholders[0];
  const masked = primary.taxId ? `•••-••-${primary.taxId.slice(-4)}` : "";

  return (
    <>
      <PageHeader title="Profile" description="Keep your contact and tax details current so certificates, tax forms and notices reach you." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Contact & tax details</CardTitle>
              <CardDescription>Changes apply to {p.myStakeholders.length > 1 ? "all of your stakeholder records in this company" : "your stakeholder record"}.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ActionForm action={updatePortalProfile} hidden={{ companyId: C }} successMessage="Profile saved" className="grid gap-4 md:grid-cols-2">
              <Field label="Full name">
                <Input name="name" defaultValue={primary.type === "INDIVIDUAL" ? primary.name : ctx.user.name} required />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" defaultValue={primary.email ?? ctx.user.email} required />
              </Field>
              <Field label="Mailing address" className="md:col-span-2" hint="Used on stock certificates, 83(b) elections and Form 3921.">
                <Textarea name="address" rows={2} defaultValue={primary.address ?? ""} />
              </Field>
              <Field label="Country of tax residence">
                <Select name="country" defaultValue={primary.country}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tax ID (SSN / TIN)" hint={primary.taxId ? "Stored encrypted. Enter a new value to replace it." : "Required before an ISO exercise can be reported on Form 3921."}>
                <Input name="taxId" defaultValue={masked} placeholder="___-__-____" autoComplete="off" />
              </Field>
              <label className="flex items-start gap-2 text-[13px] md:col-span-2">
                <input type="checkbox" name="accredited" defaultChecked={primary.accredited} className="mt-0.5 size-4 shrink-0 accent-blue-600" /> I am an accredited investor (Rule 501 of Regulation D)
              </label>
              <div className="md:col-span-2 flex justify-end">
                <SubmitButton>Save profile</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
        <div className={`grid content-start items-start gap-4 ${p.myStakeholders.length > 1 ? "md:grid-cols-2 lg:grid-cols-1" : ""}`}>
          {p.myStakeholders.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <div>
                  <CardTitle>{s.name}</CardTitle>
                  <CardDescription>
                    <Badge variant="outline">{RELATIONSHIP_LABELS[s.relationship as StakeholderRelationship] ?? s.relationship}</Badge>
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <DescriptionList
                  columns={1}
                  items={[
                    { label: "Type", value: s.type === "ENTITY" ? "Entity" : "Individual" },
                    ...(s.title ? [{ label: "Title", value: s.title }] : []),
                    ...(s.department ? [{ label: "Department", value: s.department }] : []),
                    ...(s.startDate ? [{ label: "Start date", value: date(s.startDate) }] : []),
                    ...(s.terminationDate ? [{ label: "End date", value: date(s.terminationDate) }] : []),
                    { label: "Portal invitation", value: s.portalAcceptedAt ? `Accepted ${date(s.portalAcceptedAt)}` : s.portalInvitedAt ? `Invited ${date(s.portalInvitedAt)}` : "Linked by admin" },
                  ]}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
