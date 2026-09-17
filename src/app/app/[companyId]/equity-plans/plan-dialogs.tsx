"use client";

import { Plus, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { shares } from "@/lib/format";
import { createPlan, increaseReserve, reactivatePlan, terminatePlan, updatePlan } from "./actions";

const today = () => format(new Date(), "yyyy-MM-dd");

export function NewPlanDialog({ companyId, shareClasses }: { companyId: string; shareClasses: { id: string; name: string; available: number }[] }) {
  return (
    <FormDialog
      trigger={
        <Button>
          <Plus /> New plan
        </Button>
      }
      title="Create equity incentive plan"
      description="Reserves shares of a class for option, RSU and restricted stock awards."
      action={createPlan}
      hidden={{ companyId }}
      submitLabel="Create plan"
      redirectTo={(r) => `/app/${companyId}/equity-plans/${r.data?.id ?? ""}`}
    >
      <Field label="Plan name" required>
        <Input name="name" placeholder={`${new Date().getFullYear()} Equity Incentive Plan`} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Share class" required hint="Usually Common Stock.">
          <Select name="shareClassId" defaultValue={shareClasses[0]?.id}>
            {shareClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {shares(c.available)} unreserved
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Shares reserved" required>
          <Input name="authorizedShares" type="number" min={1} step={1} required />
        </Field>
        <Field label="Adoption date">
          <Input name="adoptionDate" type="date" defaultValue={today()} />
        </Field>
        <Field label="Board approval date">
          <Input name="boardApprovalDate" type="date" defaultValue={today()} />
        </Field>
        <Field label="Stockholder approval date" hint="Required within 12 months for ISOs.">
          <Input name="stockholderApprovalDate" type="date" />
        </Field>
        <Field label="Expiration date" hint="Defaults to 10 years from adoption.">
          <Input name="expirationDate" type="date" />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" rows={2} />
      </Field>
    </FormDialog>
  );
}

export function IncreaseReserveDialog({ companyId, planId, planName, available, classAvailable }: { companyId: string; planId: string; planName: string; available: number; classAvailable: number }) {
  return (
    <FormDialog
      trigger={
        <Button variant="secondary">
          <TrendingUp /> Increase reserve
        </Button>
      }
      title={`Increase ${planName} reserve`}
      description={`${shares(available)} shares currently available in the pool. ${shares(classAvailable)} unreserved shares remain in the underlying class.`}
      action={increaseReserve}
      hidden={{ companyId, planId }}
      submitLabel="Increase reserve"
      size="sm"
    >
      <Field label="Shares to add" required>
        <Input name="sharesToAdd" type="number" min={1} max={classAvailable} step={1} required />
      </Field>
      <Field label="Board approval date" required hint="A task will remind you to attach the board consent.">
        <Input name="boardApprovalDate" type="date" defaultValue={today()} />
      </Field>
      <Field label="Notes">
        <Input name="notes" placeholder="Approved alongside Series B term sheet" />
      </Field>
    </FormDialog>
  );
}

export function EditPlanDialog({ companyId, plan }: { companyId: string; plan: { id: string; name: string; adoptionDate: string | null; boardApprovalDate: string | null; stockholderApprovalDate: string | null; expirationDate: string | null; notes: string | null } }) {
  return (
    <FormDialog trigger={<Button variant="ghost">Edit</Button>} title="Edit plan" action={updatePlan} hidden={{ companyId, planId: plan.id }} submitLabel="Save">
      <Field label="Plan name" required>
        <Input name="name" defaultValue={plan.name} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Adoption date">
          <Input name="adoptionDate" type="date" defaultValue={plan.adoptionDate ?? ""} />
        </Field>
        <Field label="Board approval date">
          <Input name="boardApprovalDate" type="date" defaultValue={plan.boardApprovalDate ?? ""} />
        </Field>
        <Field label="Stockholder approval date">
          <Input name="stockholderApprovalDate" type="date" defaultValue={plan.stockholderApprovalDate ?? ""} />
        </Field>
        <Field label="Expiration date">
          <Input name="expirationDate" type="date" defaultValue={plan.expirationDate ?? ""} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={plan.notes ?? ""} />
      </Field>
    </FormDialog>
  );
}

export function TerminatePlanButton({ companyId, planId, planName, active }: { companyId: string; planId: string; planName: string; active: boolean }) {
  return active ? (
    <ConfirmButton action={terminatePlan} hidden={{ companyId, planId }} title={`Terminate ${planName}?`} description="No new awards can be granted from a terminated plan. Outstanding grants are unaffected and continue to vest and be exercisable." confirmLabel="Terminate plan" variant="destructive">
      Terminate plan
    </ConfirmButton>
  ) : (
    <ConfirmButton action={reactivatePlan} hidden={{ companyId, planId }} title={`Reactivate ${planName}?`} description="Grants can be made from the plan again." confirmLabel="Reactivate" variant="secondary">
      Reactivate plan
    </ConfirmButton>
  );
}
