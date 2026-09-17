"use client";

import { FormDialog } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { toInputDate } from "@/lib/format";
import { saveRound } from "./actions";

const TYPES = [
  ["PRICED", "Priced equity round"],
  ["SAFE", "SAFE round"],
  ["CONVERTIBLE_NOTE", "Convertible note round"],
  ["BRIDGE", "Bridge"],
  ["SECONDARY", "Secondary"],
] as const;

export function RoundDialog({
  companyId,
  trigger,
  round,
  shareClasses,
}: {
  companyId: string;
  trigger: React.ReactNode;
  round?: { id: string; name: string; roundType: string; targetAmount: number | null; preMoneyValuation: number | null; leadInvestor: string | null; closeDate: Date | string | null; notes: string | null; status: string; shareClassId: string | null };
  shareClasses: { id: string; name: string; type: string }[];
}) {
  const closed = round?.status === "CLOSED";
  return (
    <FormDialog
      trigger={trigger}
      title={round ? `Edit ${round.name}` : "New financing round"}
      description={round ? (closed ? "This round is closed; only descriptive fields can change." : "Update the planned terms.") : "Plan a round now and close it later to issue shares."}
      action={saveRound}
      hidden={{ companyId, roundId: round?.id }}
      submitLabel={round ? "Save changes" : "Create round"}
      successMessage={round ? "Round updated" : "Round created"}
      redirectTo={round ? undefined : (r) => `/app/${companyId}/fundraising/rounds/${r.data?.id}`}
    >
      {({ fieldErrors }) => (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Round name" required error={fieldErrors.name}>
              <Input name="name" defaultValue={round?.name ?? ""} placeholder="Series B" required />
            </Field>
            <Field label="Type" error={fieldErrors.roundType}>
              <Select name="roundType" defaultValue={round?.roundType ?? "PRICED"} disabled={closed}>
                {TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target amount" error={fieldErrors.targetAmount}>
              <Input name="targetAmount" type="number" min={0} step={1000} prefix="$" defaultValue={round?.targetAmount ?? ""} disabled={closed} />
            </Field>
            <Field label="Pre-money valuation" error={fieldErrors.preMoneyValuation}>
              <Input name="preMoneyValuation" type="number" min={0} step={1000} prefix="$" defaultValue={round?.preMoneyValuation ?? ""} disabled={closed} />
            </Field>
            <Field label="Lead investor" error={fieldErrors.leadInvestor}>
              <Input name="leadInvestor" defaultValue={round?.leadInvestor ?? ""} />
            </Field>
            <Field label={closed ? "Close date" : "Planned close date"} error={fieldErrors.closeDate}>
              <Input name="closeDate" type="date" defaultValue={toInputDate(round?.closeDate)} disabled={closed} />
            </Field>
            {!closed ? (
              <Field label="Share class (optional)" hint="Leave empty to create a new class when closing." className="sm:col-span-2">
                <Select name="shareClassId" defaultValue={round?.shareClassId ?? ""}>
                  <option value="">Create new preferred class at close</option>
                  {shareClasses
                    .filter((c) => c.type === "PREFERRED")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <Field label="Notes">
            <Textarea name="notes" defaultValue={round?.notes ?? ""} rows={3} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
