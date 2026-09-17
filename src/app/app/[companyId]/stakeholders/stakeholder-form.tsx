"use client";

import * as React from "react";
import { FormDialog } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/misc";
import { RELATIONSHIP_LABELS, STAKEHOLDER_RELATIONSHIPS } from "@/lib/types";
import { toInputDate } from "@/lib/format";
import { saveStakeholder } from "./actions";

export interface StakeholderFormValues {
  id?: string;
  name?: string;
  email?: string | null;
  type?: string;
  relationship?: string;
  title?: string | null;
  department?: string | null;
  costCenter?: string | null;
  employeeId?: string | null;
  employmentStatus?: string | null;
  startDate?: string | Date | null;
  country?: string;
  address?: string | null;
  taxId?: string | null;
  isUsTaxpayer?: boolean;
  accredited?: boolean;
  tags?: string[];
  notes?: string | null;
}

export function StakeholderFormDialog({
  companyId,
  trigger,
  initial,
  open,
  onOpenChange,
  redirectToDetail,
}: {
  companyId: string;
  trigger?: React.ReactNode;
  initial?: StakeholderFormValues;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  redirectToDetail?: boolean;
}) {
  const [relationship, setRelationship] = React.useState(initial?.relationship ?? "EMPLOYEE");
  const isEmployee = ["EMPLOYEE", "FOUNDER", "FORMER_EMPLOYEE"].includes(relationship);
  // Two columns from sm; on phones only the short select/date pairs stay side by side.
  const full = "col-span-2 sm:col-span-1";
  return (
    <FormDialog<{ id: string }>
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? "Edit stakeholder" : "Add stakeholder"}
      description={initial?.id ? undefined : "Stakeholders hold securities. Invite them to the portal once their equity is issued."}
      action={saveStakeholder}
      hidden={{ companyId, id: initial?.id }}
      submitLabel={initial?.id ? "Save changes" : "Add stakeholder"}
      size="lg"
      redirectTo={redirectToDetail ? (r) => `/app/${companyId}/stakeholders/${r.data?.id}` : undefined}
    >
      {({ fieldErrors }) => (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name / entity name" className={full} required error={fieldErrors.name}>
              <Input name="name" required defaultValue={initial?.name ?? ""} placeholder="Ada Lovelace or Fund I, L.P." />
            </Field>
            <Field label="Email" className={full} error={fieldErrors.email} hint="Used for portal invitations and signatures.">
              <Input name="email" type="email" defaultValue={initial?.email ?? ""} placeholder="ada@example.com" />
            </Field>
            <Field label="Type">
              <Select name="type" defaultValue={initial?.type ?? "INDIVIDUAL"}>
                <option value="INDIVIDUAL">Individual</option>
                <option value="ENTITY">Entity</option>
              </Select>
            </Field>
            <Field label="Relationship" required>
              <Select name="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                {STAKEHOLDER_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {RELATIONSHIP_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" className={full}>
              <Input name="title" defaultValue={initial?.title ?? ""} placeholder="Senior Engineer" />
            </Field>
            <Field label="Department" className={full}>
              <Input name="department" defaultValue={initial?.department ?? ""} placeholder="Engineering" />
            </Field>
            {isEmployee ? (
              <>
                <Field label="Employment status">
                  <Select name="employmentStatus" defaultValue={initial?.employmentStatus ?? (relationship === "FORMER_EMPLOYEE" ? "TERMINATED" : "ACTIVE")}>
                    <option value="ACTIVE">Active</option>
                    <option value="ON_LEAVE">On leave</option>
                    <option value="TERMINATED">Terminated</option>
                  </Select>
                </Field>
                <Field label="Start date">
                  <Input name="startDate" type="date" defaultValue={toInputDate(initial?.startDate)} />
                </Field>
                <Field label="Employee ID" className={full}>
                  <Input name="employeeId" defaultValue={initial?.employeeId ?? ""} placeholder="E-001" />
                </Field>
                <Field label="Cost center" className={full} hint="Used for ASC 718 expense allocation.">
                  <Input name="costCenter" defaultValue={initial?.costCenter ?? ""} placeholder="R&D" />
                </Field>
              </>
            ) : null}
            <Field label="Country" className={full} hint="ISO 2-letter code.">
              <Input name="country" defaultValue={initial?.country ?? "US"} maxLength={2} className="uppercase" />
            </Field>
            <Field label="Tax ID" className={full} hint="SSN / EIN, stored for tax forms.">
              <Input name="taxId" defaultValue={initial?.taxId ?? ""} placeholder="XXX-XX-XXXX" />
            </Field>
            <Field label="Address" className="col-span-2">
              <Input name="address" defaultValue={initial?.address ?? ""} placeholder="Street, City, State ZIP" />
            </Field>
            <Field label="Tags" hint="Comma separated, e.g. Angel, Board." className="col-span-2">
              <Input name="tags" defaultValue={initial?.tags?.join(", ") ?? ""} />
            </Field>
            <Field label="Notes" className="col-span-2">
              <Textarea name="notes" defaultValue={initial?.notes ?? ""} rows={2} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox name="isUsTaxpayer" defaultChecked={initial?.isUsTaxpayer ?? true} /> US taxpayer
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox name="accredited" defaultChecked={initial?.accredited ?? false} /> Accredited investor
            </label>
          </div>
        </>
      )}
    </FormDialog>
  );
}
