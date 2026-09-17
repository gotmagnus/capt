"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/forms";
import { updateCompany } from "@/app/app/[companyId]/settings/actions";

const STATES = ["Delaware", "California", "New York", "Texas", "Washington", "Massachusetts", "Nevada", "Wyoming", "Other"];

export type CompanyFormValues = {
  id: string;
  name: string;
  legalName: string;
  entityType: string;
  stage: string;
  incorporationState: string;
  /** yyyy-mm-dd, already formatted on the server */
  incorporationDate: string;
  ein: string | null;
  website: string | null;
  address: string | null;
  authorizedShares: number | null;
  parValue: number;
  totalAssets: number | null;
  fiscalYearEnd: string;
  currency: string;
};

/**
 * Company profile form. Lives in a client component because it reads `fieldErrors` from
 * ActionForm's render prop — a function child cannot cross the server → client boundary.
 */
export function CompanyForm({ company: c, canEdit }: { company: CompanyFormValues; canEdit: boolean }) {
  const disabled = !canEdit;
  return (
    <ActionForm action={updateCompany} hidden={{ companyId: c.id }} successMessage="Company profile saved">
      {({ fieldErrors }) => (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Identity</CardTitle>
                <CardDescription>How the company appears across the workspace and on generated documents.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Display name" error={fieldErrors.name} required>
                <Input name="name" defaultValue={c.name} disabled={disabled} required />
              </Field>
              <Field label="Legal name" error={fieldErrors.legalName} required hint="Exactly as it appears on the certificate of incorporation.">
                <Input name="legalName" defaultValue={c.legalName} disabled={disabled} required />
              </Field>
              <Field label="Entity type">
                <Select name="entityType" defaultValue={c.entityType} disabled={disabled}>
                  <option value="C_CORP">C corporation</option>
                  <option value="S_CORP">S corporation</option>
                  <option value="PBC">Public benefit corporation</option>
                  <option value="LLC">LLC</option>
                </Select>
              </Field>
              <Field label="Stage">
                <Select name="stage" defaultValue={c.stage} disabled={disabled}>
                  <option value="PRE_SEED">Pre-seed</option>
                  <option value="SEED">Seed</option>
                  <option value="SERIES_A">Series A</option>
                  <option value="SERIES_B">Series B</option>
                  <option value="SERIES_C_PLUS">Series C+</option>
                  <option value="LATE">Late stage</option>
                </Select>
              </Field>
              <Field label="State of incorporation">
                <Select name="incorporationState" defaultValue={STATES.includes(c.incorporationState) ? c.incorporationState : "Other"} disabled={disabled}>
                  {STATES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Incorporation date">
                <Input type="date" name="incorporationDate" defaultValue={c.incorporationDate} disabled={disabled} />
              </Field>
              <Field label="EIN" hint="Used on Form 3921 and 83(b) elections.">
                <Input name="ein" defaultValue={c.ein ?? ""} placeholder="12-3456789" disabled={disabled} />
              </Field>
              <Field label="Website">
                <Input name="website" defaultValue={c.website ?? ""} placeholder="https://" disabled={disabled} />
              </Field>
              <Field label="Registered address" className="md:col-span-2">
                <Textarea name="address" defaultValue={c.address ?? ""} rows={2} disabled={disabled} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Capitalization & finance</CardTitle>
                <CardDescription>Defaults for new share classes and inputs to compliance checks.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Total authorized shares" hint="Across all classes, per the charter.">
                <Input type="number" name="authorizedShares" defaultValue={c.authorizedShares ?? ""} min={0} step={1} disabled={disabled} />
              </Field>
              <Field label="Default par value">
                <Input type="number" name="parValue" defaultValue={c.parValue} min={0} step="any" prefix="$" disabled={disabled} />
              </Field>
              <Field label="Total assets" hint="Used for the Rule 701 15%-of-assets test.">
                <Input type="number" name="totalAssets" defaultValue={c.totalAssets ?? ""} min={0} step={1} prefix="$" disabled={disabled} />
              </Field>
              <Field label="Fiscal year end" hint="MM-DD" error={fieldErrors.fiscalYearEnd}>
                <Input name="fiscalYearEnd" defaultValue={c.fiscalYearEnd} pattern="\d{2}-\d{2}" disabled={disabled} />
              </Field>
              <Field label="Reporting currency">
                <Select name="currency" defaultValue={c.currency} disabled={disabled}>
                  {["USD", "EUR", "GBP", "CAD", "AUD", "SGD"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
            </CardContent>
          </Card>

          {canEdit ? (
            <div className="flex justify-end">
              <SubmitButton>Save changes</SubmitButton>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">You have view-only access to company settings.</p>
          )}
        </div>
      )}
    </ActionForm>
  );
}
