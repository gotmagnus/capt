"use client";

import { CheckCircle2, FileCheck, Play, RotateCcw, XCircle } from "lucide-react";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { acceptValuation, deliverDraft, markInProgress, requestRevision, withdrawValuation } from "./actions";

export function ValuationActions({
  companyId,
  valuation,
  defaults,
}: {
  companyId: string;
  valuation: { id: string; status: string; analyst: string | null; fairMarketValue: number | null; preferredPrice: number | null; enterpriseValue: number | null; equityValue: number | null; methodology: string | null; dlomPercent: number | null; volatility: number | null; riskFreeRate: number | null; timeToLiquidity: number | null };
  defaults: { preferredPrice: number | null };
}) {
  const hidden = { companyId, valuationId: valuation.id };
  const open = ["REQUESTED", "IN_PROGRESS", "DRAFT_DELIVERED"].includes(valuation.status);
  if (!open) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {valuation.status === "REQUESTED" ? (
        <FormDialog
          trigger={
            <Button variant="secondary">
              <Play /> Mark in progress
            </Button>
          }
          title="Start the valuation"
          description="Assign an analyst. The requester is notified when the draft is ready."
          action={markInProgress}
          hidden={hidden}
          submitLabel="Start"
          size="sm"
          successMessage="Marked in progress"
        >
          <Field label="Analyst">
            <Input name="analyst" defaultValue={valuation.analyst ?? ""} placeholder="R. Delgado, CFA" />
          </Field>
        </FormDialog>
      ) : null}

      {valuation.status !== "DRAFT_DELIVERED" || true ? (
        <FormDialog
          trigger={
            <Button variant={valuation.status === "DRAFT_DELIVERED" ? "secondary" : "default"}>
              <FileCheck /> {valuation.status === "DRAFT_DELIVERED" ? "Revise draft" : "Deliver draft"}
            </Button>
          }
          title="Deliver valuation draft"
          description="Enter the analyst's conclusions. A summary report is generated and stored in Documents → Valuations."
          action={deliverDraft}
          hidden={hidden}
          submitLabel="Deliver draft"
          size="lg"
          successMessage="Draft delivered"
        >
          {({ fieldErrors }) => (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Common FMV per share" required error={fieldErrors.fairMarketValue} className="col-span-2 sm:col-span-1">
                <Input name="fairMarketValue" type="number" prefix="$" step={0.01} min={0.0001} defaultValue={valuation.fairMarketValue ?? ""} required />
              </Field>
              <Field label="Preferred price per share" hint="Defaults to the last round price." className="col-span-2 sm:col-span-1">
                <Input name="preferredPrice" type="number" prefix="$" step={0.01} min={0} defaultValue={valuation.preferredPrice ?? defaults.preferredPrice ?? ""} />
              </Field>
              <Field label="Enterprise value">
                <Input name="enterpriseValue" type="number" prefix="$" step={1000} min={0} defaultValue={valuation.enterpriseValue ?? ""} />
              </Field>
              <Field label="Equity value">
                <Input name="equityValue" type="number" prefix="$" step={1000} min={0} defaultValue={valuation.equityValue ?? ""} />
              </Field>
              <Field label="Methodology" required className="col-span-2 sm:col-span-1">
                <Select name="methodology" defaultValue={valuation.methodology ?? "BACKSOLVE"}>
                  <option value="BACKSOLVE">Backsolve (market approach)</option>
                  <option value="OPM">Option pricing method</option>
                  <option value="PWERM">PWERM</option>
                  <option value="HYBRID">Hybrid (OPM + PWERM)</option>
                  <option value="MARKET">Market approach</option>
                  <option value="INCOME">Income approach (DCF)</option>
                  <option value="ASSET">Asset approach</option>
                </Select>
              </Field>
              <Field label="DLOM">
                <Input name="dlomPercent" type="number" suffix="%" step={0.5} min={0} max={80} defaultValue={valuation.dlomPercent ?? 30} />
              </Field>
              <Field label="Volatility">
                <Input name="volatility" type="number" suffix="%" step={0.5} min={0} max={200} defaultValue={valuation.volatility != null ? valuation.volatility * 100 : 55} />
              </Field>
              <Field label="Risk-free rate">
                <Input name="riskFreeRate" type="number" suffix="%" step={0.01} min={0} max={20} defaultValue={valuation.riskFreeRate != null ? valuation.riskFreeRate * 100 : 4.1} />
              </Field>
              <Field label="Time to liquidity">
                <Input name="timeToLiquidity" type="number" suffix="years" step={0.5} min={0} max={15} defaultValue={valuation.timeToLiquidity ?? 3} />
              </Field>
              <Field label="Analyst" className="col-span-2 sm:col-span-1">
                <Input name="analyst" defaultValue={valuation.analyst ?? ""} />
              </Field>
              <Field label="Notes" className="col-span-2">
                <Textarea name="notes" rows={2} />
              </Field>
            </div>
          )}
        </FormDialog>
      ) : null}

      {valuation.status === "DRAFT_DELIVERED" ? (
        <>
          <ConfirmButton action={acceptValuation} hidden={hidden} title="Accept this valuation?" description={`Sets the common FMV to $${(valuation.fairMarketValue ?? 0).toFixed(2)} per share for the next 12 months, supersedes the previous valuation and drafts a board consent to ratify it.`} confirmLabel="Accept valuation" variant="default" successMessage="Valuation accepted">
            <CheckCircle2 /> Accept
          </ConfirmButton>
          <FormDialog
            trigger={
              <Button variant="ghost">
                <RotateCcw /> Request revision
              </Button>
            }
            title="Request a revision"
            description="The draft goes back to the analyst with your comments."
            action={requestRevision}
            hidden={hidden}
            submitLabel="Send back"
            size="sm"
            successMessage="Revision requested"
          >
            {({ fieldErrors }) => (
              <Field label="What should the analyst revisit?" required error={fieldErrors.note}>
                <Textarea name="note" rows={4} placeholder="e.g. The DLOM looks high given the Series B conversations; please reconsider the time to liquidity." required />
              </Field>
            )}
          </FormDialog>
        </>
      ) : null}

      <ConfirmButton action={withdrawValuation} hidden={hidden} title="Withdraw this request?" description="The request is closed without a valuation. The current accepted FMV is unaffected." confirmLabel="Withdraw" variant="ghost" successMessage="Request withdrawn">
        <XCircle /> Withdraw
      </ConfirmButton>
    </div>
  );
}
