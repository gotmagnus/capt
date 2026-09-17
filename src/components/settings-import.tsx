"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/forms";
import { commitImport, previewImport, type ImportPreview } from "@/app/app/[companyId]/settings/actions";
import type { ActionResult } from "@/lib/actions";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";

export function ImportCapTable({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState<ActionResult<ImportPreview> | undefined, FormData>(previewImport, undefined);
  const [done, setDone] = useState<number | null>(null);
  const preview = state?.ok ? state.data : undefined;

  if (done !== null) {
    return (
      <Alert tone="success" icon={CheckCircle2} title={`Imported ${done} securities`}>
        Stakeholders and issuance transactions were created. Review them on the cap table.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="companyId" value={companyId} />
        <Field label="CSV file">
          <Input type="file" name="file" accept=".csv,text/csv" className="h-auto cursor-pointer py-1.5 file:mr-3 file:cursor-pointer file:rounded file:bg-muted file:px-2.5 file:py-1 file:text-xs" />
        </Field>
        <Field label="…or paste CSV" hint="First row must be a header. Dates as YYYY-MM-DD.">
          <Textarea name="csv" rows={4} className="font-mono text-xs" placeholder={"Holder name,Email,Relationship,Security type,Share class or plan,Quantity,Price or strike,Issue date,Vesting schedule,Vesting start"} />
        </Field>
        {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
        <Button type="submit" variant="secondary" loading={pending}>
          <Upload /> Preview import
        </Button>
      </form>

      {preview ? (
        <div className="rounded-lg border border-border">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-[13px]">
            <span className="font-medium">{preview.rows.length} rows</span>
            <Badge variant="success">{preview.valid} valid</Badge>
            {preview.invalid ? <Badge variant="danger">{preview.invalid} with errors</Badge> : null}
          </div>
          <div className="max-h-80 overflow-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Holder</th>
                  <th>Type</th>
                  <th>Class / plan</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Price</th>
                  <th>Issue date</th>
                  <th>Vesting</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="text-muted-foreground">{r.line}</td>
                    <td>
                      {r.holderName}
                      {r.existingStakeholderId ? <span className="ml-1 text-[10px] text-accent-foreground">existing</span> : <span className="ml-1 text-[10px] text-muted-foreground">new</span>}
                    </td>
                    <td>{r.securityType ? SECURITY_TYPE_LABELS[r.securityType as SecurityType] ?? r.securityType : "?"}</td>
                    <td className="text-muted-foreground">{r.classOrPlanName || "auto"}</td>
                    <td className="num">{r.quantity.toLocaleString()}</td>
                    <td className="num">{r.price ?? "—"}</td>
                    <td>{r.issueDate ? r.issueDate.slice(0, 10) : "—"}</td>
                    <td className="text-muted-foreground">{r.vestingScheduleName || "—"}</td>
                    <td>
                      {r.errors.length ? (
                        <span className="flex items-center gap-1 text-xs text-danger">
                          <AlertTriangle className="size-3" /> {r.errors.join("; ")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="size-3" /> Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionForm action={commitImport} hidden={{ companyId, csv: preview.csv }} onSuccess={(r) => setDone(r.data?.created ?? 0)} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-3 py-2.5">
            {preview.invalid ? (
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="skipInvalid" className="size-4 accent-blue-600" /> Skip the {preview.invalid} invalid row{preview.invalid === 1 ? "" : "s"}
              </label>
            ) : null}
            <SubmitButton className="ml-auto" disabled={preview.valid === 0}>
              Import {preview.valid} securities
            </SubmitButton>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
