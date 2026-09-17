"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/page";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { date } from "@/lib/format";
import { createApiKey, revokeApiKey } from "@/app/app/[companyId]/settings/actions";

export function ApiKeyCard({ companyId, existing, canManage }: { companyId: string; existing: { prefix: string; createdAt: string; createdBy: string } | null; canManage: boolean }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {revealed ? (
        <Alert tone="success" title="Your new API key">
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 break-all rounded bg-white/70 px-2 py-1 font-mono text-xs">{revealed}</code>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                navigator.clipboard?.writeText(revealed);
                toast.success("Copied");
              }}
            >
              <Copy className="size-3" /> Copy
            </Button>
          </div>
          <p className="mt-1 text-xs">Store it securely — it won't be shown again.</p>
        </Alert>
      ) : null}
      {existing ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-border bg-muted px-3 py-2 text-[13px]">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
            <code className="font-mono text-xs">{existing.prefix}••••••••••••••••</code>
            <span className="text-xs text-muted-foreground">
              read-only · created {date(existing.createdAt)} by {existing.createdBy}
            </span>
          </div>
          {canManage ? (
            <div className="flex shrink-0 gap-2">
              <FormDialog trigger={<Button size="xs" variant="secondary">Rotate</Button>} title="Rotate API key?" description="The current key stops working immediately." action={createApiKey} hidden={{ companyId }} submitLabel="Rotate" size="sm" onSuccess={(r) => setRevealed(r.data?.key ?? null)}>
                <p className="text-[13px] text-muted-foreground">Update any integrations using the old key.</p>
              </FormDialog>
              <ConfirmButton action={revokeApiKey} hidden={{ companyId }} title="Revoke API key?" variant="ghost" size="xs" confirmLabel="Revoke" successMessage="API key revoked">
                Revoke
              </ConfirmButton>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
          No API key yet.
          {canManage ? (
            <FormDialog trigger={<Button size="sm" variant="secondary">Generate key</Button>} title="Generate a read-only API key" description="Use it with the REST API to pull cap table, securities and vesting data into your own systems." action={createApiKey} hidden={{ companyId }} submitLabel="Generate" size="sm" onSuccess={(r) => setRevealed(r.data?.key ?? null)}>
              <p className="text-[13px] text-muted-foreground">Keys are scoped to this company and can only read data.</p>
            </FormDialog>
          ) : null}
        </div>
      )}
    </div>
  );
}
