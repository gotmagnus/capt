"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Download, FolderOpen, Link2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { deleteScenario, duplicateScenario, saveScenarioForm, updateScenario } from "./actions";

export interface ScenarioSummary {
  id: string;
  name: string;
  description: string | null;
  params: string;
  updatedAt: string;
}

export function ScenarioBar({
  companyId,
  type,
  scenarios,
  currentId,
  params,
  results,
  onLoad,
  onNew,
  canEdit,
  basePath,
}: {
  companyId: string;
  type: "FINANCING" | "EXIT";
  scenarios: ScenarioSummary[];
  currentId: string | null;
  params: unknown;
  results?: unknown;
  onLoad: (scenario: ScenarioSummary) => void;
  onNew: () => void;
  canEdit: boolean;
  basePath: string; // e.g. /app/x/modeling or /app/x/modeling/exit
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);
  const current = scenarios.find((s) => s.id === currentId) ?? null;
  const paramsJson = JSON.stringify(params);
  const resultsJson = results === undefined ? undefined : JSON.stringify(results);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: { id: string } }>, after?: (id?: string) => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Done");
        after?.(res.data?.id);
      } else toast.error(res.error ?? "Something went wrong");
    });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none [&>div]:min-w-0 [&>div]:flex-1 sm:[&>div]:w-72 sm:[&>div]:flex-none">
        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        <Select
          className="h-8"
          aria-label="Scenario"
          value={currentId ?? ""}
          onChange={(e) => {
            const s = scenarios.find((x) => x.id === e.target.value);
            if (s) {
              onLoad(s);
              router.replace(`${basePath}?scenario=${s.id}`);
            } else {
              onNew();
              router.replace(basePath);
            }
          }}
        >
          <option value="">Unsaved scenario</option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      {current ? <Badge variant="neutral">Saved {new Date(current.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Badge> : <Badge variant="warning">Unsaved</Badge>}
      {current?.description ? <span className="hidden max-w-xs truncate text-xs text-muted-foreground lg:inline">{current.description}</span> : null}

      <div className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto sm:justify-end">
        <Button variant="ghost" size="sm" onClick={onNew}>
          <Plus /> New
        </Button>
        {current ? (
          <Button variant="ghost" size="sm" loading={pending} onClick={() => run(() => updateScenario(companyId, current.id, params, results))}>
            <Save /> Save
          </Button>
        ) : null}
        <FormDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          trigger={
            <Button variant={current ? "ghost" : "secondary"} size="sm">
              <Save /> {current ? "Save as…" : "Save scenario"}
            </Button>
          }
          title={current ? "Save as new scenario" : "Save scenario"}
          description="Saved scenarios keep their inputs; results are recomputed from the live cap table when reopened."
          action={saveScenarioForm}
          hidden={{ companyId, type, params: paramsJson, results: resultsJson }}
          submitLabel="Save"
          size="sm"
          onSuccess={(r) => r.data?.id && router.replace(`${basePath}?scenario=${r.data.id}`)}
        >
          <Field label="Name" required>
            <Input name="name" defaultValue={current ? `${current.name} (copy)` : ""} placeholder={type === "EXIT" ? "Acquisition at $200M" : "Series B — $25M at $90M pre"} required />
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={2} defaultValue={current?.description ?? ""} />
          </Field>
        </FormDialog>
        {current ? (
          <>
            <Button variant="ghost" size="sm" loading={pending} onClick={() => run(() => duplicateScenario(companyId, current.id), (id) => id && router.replace(`${basePath}?scenario=${id}`))}>
              <Copy /> Duplicate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}${basePath}?scenario=${current.id}`;
                navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"), () => toast.error("Could not copy"));
              }}
            >
              <Link2 /> Share
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={`/api/companies/${companyId}/exports/scenarios/${current.id}`}>
                <Download /> Excel
              </a>
            </Button>
            {canEdit ? (
              <Button
                variant="ghost"
                size="sm"
                loading={pending}
                onClick={() => {
                  if (!window.confirm(`Delete “${current.name}”?`)) return;
                  run(() => deleteScenario(companyId, current.id), () => {
                    onNew();
                    router.replace(basePath);
                  });
                }}
              >
                <Trash2 /> Delete
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
