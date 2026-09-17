import { Webhook } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { INTEGRATION_PROVIDERS } from "@/lib/types";
import { parseJson } from "@/lib/utils";
import { PageHeader, Section } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationCard } from "@/components/settings-integration-card";
import { ApiKeyCard } from "@/components/settings-api-key";

export const metadata = { title: "Integrations" };

const CATEGORY_LABELS: Record<string, { title: string; description: string }> = {
  HRIS: { title: "HR & payroll", description: "Keep employees, start dates and terminations in sync." },
  ACCOUNTING: { title: "Accounting", description: "Post stock-based compensation expense to your ledger." },
  COMMUNICATION: { title: "Communication", description: "Get notified where your team already works." },
  ESIGN: { title: "E-signature", description: "Use your own signing provider for agreements." },
  LIQUIDITY: { title: "Liquidity", description: "Run secondary programs with a market partner." },
};

export default async function IntegrationsPage(props: PageProps<"/app/[companyId]/settings/integrations">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const rows = await db.integration.findMany({ where: { companyId: C } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const settings = parseJson<{ apiKey?: { prefix: string; createdAt: string; createdBy: string }; webhooks?: { url: string; events: string[] }[] }>(ctx.company.settings, {});
  const categories = [...new Set(INTEGRATION_PROVIDERS.map((p) => p.category))];
  const connectedCount = rows.filter((r) => r.status === "CONNECTED").length;

  return (
    <>
      <PageHeader title="Integrations" description={`${connectedCount} connected. Connections are scoped to this company and can be revoked at any time.`} />
      <div className="space-y-8">
        {categories.map((cat) => (
          <Section key={cat} title={CATEGORY_LABELS[cat]?.title ?? cat} description={CATEGORY_LABELS[cat]?.description}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INTEGRATION_PROVIDERS.filter((p) => p.category === cat).map((p) => {
                const r = byProvider.get(p.id);
                return <IntegrationCard key={p.id} companyId={C} provider={p} status={r?.status ?? "DISCONNECTED"} connectedAt={r?.connectedAt?.toISOString() ?? null} lastSyncAt={r?.lastSyncAt?.toISOString() ?? null} config={parseJson<Record<string, unknown>>(r?.config, {})} canEdit={ctx.canEdit} />;
              })}
            </div>
          </Section>
        ))}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>API access</CardTitle>
              <CardDescription>Read-only REST access to cap table, securities, stakeholders and vesting data. Base URL <code className="font-mono text-xs">/api/v1</code>.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ApiKeyCard companyId={C} existing={settings.apiKey ?? null} canManage={ctx.role === "ADMIN"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Webhook className="size-4 text-muted-foreground" /> Webhooks
                <Badge variant="neutral">Coming soon</Badge>
              </CardTitle>
              <CardDescription>Receive JSON events when securities are issued, exercised or cancelled, when documents are signed and when consents are approved.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {settings.webhooks?.length ? (
              <ul className="space-y-1 text-[13px]">
                {settings.webhooks.map((w) => (
                  <li key={w.url} className="font-mono text-xs">
                    {w.url} <span className="text-muted-foreground">({w.events.join(", ")})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">No webhook endpoints configured. Available events: security.issued, security.exercised, security.cancelled, document.signed, consent.approved, valuation.accepted.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
