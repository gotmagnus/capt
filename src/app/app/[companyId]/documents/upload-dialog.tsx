"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { FormDialog } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { DOCUMENT_TYPE_LABELS } from "@/lib/types";
import { uploadDocument } from "./actions";

export function UploadDialog({ companyId, folders, defaultFolder, securities, stakeholders }: { companyId: string; folders: string[]; defaultFolder: string; securities: { id: string; label: string }[]; stakeholders: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [folder, setFolder] = useState(folders.includes(defaultFolder) ? defaultFolder : folders[0] ?? "General");
  const [newFolder, setNewFolder] = useState(false);
  return (
    <FormDialog
      trigger={
        <Button>
          <Upload /> Upload document
        </Button>
      }
      action={uploadDocument}
      hidden={{ companyId }}
      title="Upload a document"
      description="Text and Markdown files are stored inline and render in the viewer; other files are stored with metadata."
      submitLabel="Upload"
      size="lg"
      successMessage="Document uploaded"
    >
      <div className="flex gap-1 rounded-md bg-muted p-1 text-[13px]">
        <button type="button" onClick={() => setMode("file")} className={`flex-1 rounded px-3 py-1.5 ${mode === "file" ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}>
          Choose file
        </button>
        <button type="button" onClick={() => setMode("text")} className={`flex-1 rounded px-3 py-1.5 ${mode === "text" ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}>
          Paste text / Markdown
        </button>
      </div>
      {mode === "file" ? (
        <Field label="File">
          <Input type="file" name="file" accept=".pdf,.doc,.docx,.md,.txt,.csv,.xlsx,.png,.jpg" />
        </Field>
      ) : (
        <Field label="Content (Markdown)">
          <Textarea name="content" rows={8} placeholder="# Title&#10;&#10;Document body…" />
        </Field>
      )}
      <Field label="Name" hint="Defaults to the file name.">
        <Input name="name" placeholder="e.g. Board minutes — Q3 2026" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Folder">
          {newFolder ? (
            <div className="flex gap-2">
              <Input name="newFolder" placeholder="e.g. Fundraising/Series B" autoFocus />
              <Button type="button" variant="ghost" className="shrink-0" onClick={() => setNewFolder(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 [&>div]:min-w-0 [&>div]:flex-1">
              <Select name="folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
                {[...new Set([...folders, "General"])].sort().map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="secondary" className="shrink-0" onClick={() => setNewFolder(true)}>
                New
              </Button>
            </div>
          )}
        </Field>
        <Field label="Type">
          <Select name="type" defaultValue="OTHER">
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Visibility">
          <Select name="visibility" defaultValue="COMPANY">
            <option value="COMPANY">Company (admins, legal, finance)</option>
            <option value="BOARD">Board</option>
            <option value="INVESTORS">Investors</option>
            <option value="HOLDER">Related holder</option>
            <option value="PUBLIC">Public link</option>
          </Select>
        </Field>
        <Field label="Related security">
          <Select name="securityId" defaultValue="">
            <option value="">None</option>
            {securities.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Related stakeholder">
          <Select name="stakeholderId" defaultValue="">
            <option value="">None</option>
            {stakeholders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </FormDialog>
  );
}
