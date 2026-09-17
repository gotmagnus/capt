"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/page";
import { ActionForm, SubmitButton } from "@/components/forms";
import { dateTime, relative } from "@/lib/format";
import { INTEGRATION_PROVIDERS } from "@/lib/types";
import { syncHris } from "@/app/app/[companyId]/employees/actions";

interface IntegrationDto {
  id: string;
  provider: string;
  status: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
  config: Record<string, unknown>;
}

export function HrisSync({ companyId, integrations, employeeCount }: { companyId: string; integrations: IntegrationDto[]; employeeCount: number }) {
  const [result, setResult] = useState<{ provider: string; discrepancies: string[] } | null>(null);
  const providers = INTEGRATION_PROVIDERS.filter((p) => p.category === "HRIS");
  return (
    <div className="space-y-5">
      <Alert tone="info">
        HRIS sync keeps stakeholder records in step with payroll: new hires appear as stakeholders ready for grants, terminations trigger post-termination exercise windows, and address or title changes flow through automatically.
      </Alert>
      {result ? (
        <Alert tone={result.discrepancies.length ? "warning" : "success"} title={result.discrepancies.length ? `${result.discrepancies.length} discrepancies found (${result.provider})` : `${result.provider}: no discrepancies`}>
          {result.discrepancies.length ? (
            <ul className="mt-1 list-disc pl-4">
              {result.discrepancies.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : (
            `${employeeCount} active employees reconciled.`
          )}
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => {
          const i = integrations.find((x) => x.provider === p.id);
          const connected = i?.status === "CONNECTED";
          return (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-muted font-semibold">{p.name.slice(0, 1)}</div>
                  <div>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription>HRIS · payroll</CardDescription>
                  </div>
                </div>
                <StatusBadge status={i?.status ?? "DISCONNECTED"} />
              </CardHeader>
              <CardContent>
                {connected ? (
                  <>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <dt className="text-muted-foreground">Connected</dt>
                      <dd>{dateTime(i?.connectedAt)}</dd>
                      <dt className="text-muted-foreground">Last sync</dt>
                      <dd>{i?.lastSyncAt ? relative(i.lastSyncAt) : "Never"}</dd>
                      <dt className="text-muted-foreground">Employees synced</dt>
                      <dd>{String(i?.config.employeesSynced ?? "—")}</dd>
                      <dt className="text-muted-foreground">Auto-sync</dt>
                      <dd>{i?.config.syncNewHires ? "New hires, terminations" : "Manual"}</dd>
                    </dl>
                    <ActionForm action={syncHris} hidden={{ companyId, provider: p.id }} onSuccess={(r) => setResult({ provider: p.name, discrepancies: r.data?.discrepancies ?? [] })} className="mt-3">
                      <SubmitButton size="sm" variant="secondary" pendingText="Syncing…">
                        <RefreshCw /> Sync now
                      </SubmitButton>
                    </ActionForm>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-muted-foreground">Connect {p.name} to import employees, start dates, departments and terminations.</p>
                    <Button size="sm" variant="secondary" className="mt-3" asChild>
                      <Link href={`/app/${companyId}/settings/integrations`}>
                        <Plug /> Connect <ArrowRight />
                      </Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
