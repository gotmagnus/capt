"use client";

import * as React from "react";
import { Scissors } from "lucide-react";
import { FormDialog } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/page";
import { shares, toInputDate } from "@/lib/format";
import { recordStockSplit } from "./actions";

export function StockSplitDialog({ companyId, fullyDiluted }: { companyId: string; fullyDiluted: number }) {
  const [num, setNum] = React.useState(2);
  const [den, setDen] = React.useState(1);
  const factor = den > 0 ? num / den : 0;
  return (
    <FormDialog
      trigger={
        <Button variant="secondary" size="sm">
          <Scissors /> Record stock split
        </Button>
      }
      title="Record a stock split"
      description="Adjusts every share count, price and authorization on the ledger. Historical transactions are restated so as-of views stay consistent."
      action={recordStockSplit}
      hidden={{ companyId }}
      submitLabel="Record split"
      destructive
    >
      {/* The two ratio fields read as one sentence, so they stay side by side on phones; the date drops below. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="New shares" required hint="Shares received…">
          <Input name="numerator" type="number" min={1} step={1} value={num} onChange={(e) => setNum(Number(e.target.value))} required />
        </Field>
        <Field label="For every" required hint="…per existing share.">
          <Input name="denominator" type="number" min={1} step={1} value={den} onChange={(e) => setDen(Number(e.target.value))} required />
        </Field>
        <Field label="Effective date" required className="col-span-2 sm:col-span-1">
          <Input name="effectiveDate" type="date" required defaultValue={toInputDate(new Date())} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" rows={2} placeholder="Board approval reference, charter amendment…" />
      </Field>
      <Alert tone={factor > 1 ? "info" : "warning"}>
        {num}-for-{den} {factor > 1 ? "forward" : factor < 1 ? "reverse" : ""} split: fully diluted shares go from <strong>{shares(fullyDiluted)}</strong> to <strong>{shares(Math.round(fullyDiluted * factor))}</strong>. Prices, strikes and 409A values are divided by {factor.toFixed(4)}.
      </Alert>
    </FormDialog>
  );
}
