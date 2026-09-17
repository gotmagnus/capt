import { FileJson, FileSpreadsheet, History, Trash2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { IMPORT_COLUMNS } from "@/lib/import-csv";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/forms";
import { ImportCapTable } from "@/components/settings-import";
import { deleteCompany } from "../actions";

export const metadata = { title: "Data" };

export default async function DataPage(props: PageProps<"/app/[companyId]/settings/data">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [securities, stakeholders, documents] = await Promise.all([db.security.count({ where: { companyId: C } }), db.stakeholder.count({ where: { companyId: C } }), db.document.count({ where: { companyId: C } })]);

  return (
    <>
      <PageHeader title="Data" description="Your data is yours. Export everything at any time, or bring in an existing cap table from a spreadsheet." />
      <div className="space-y-5">
        <Card>
          <CardHeader className="flex-col sm:flex-row">
            <div className="min-w-0">
              <CardTitle>Export everything</CardTitle>
              <CardDescription>
                A complete JSON snapshot: {stakeholders} stakeholders, {securities} securities, {documents} documents (metadata), plus classes, plans, schedules, transactions, valuations, rounds and consents. Tax IDs are redacted.
              </CardDescription>
            </div>
            <Button variant="secondary" className="shrink-0" asChild>
              <a href={`/api/companies/${C}/export-all`}>
                <FileJson /> Download JSON
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-[13px] text-muted-foreground">
              Need spreadsheets instead? Every report on the <a href={`/app/${C}/reports`} className="text-accent-foreground hover:underline">Reports</a> page exports to CSV and Excel.
            </p>
          </CardContent>
        </Card>

        {ctx.canEdit ? (
          <Card>
            <CardHeader className="flex-col sm:flex-row">
              <div className="min-w-0">
                <CardTitle>Import cap table</CardTitle>
                <CardDescription>Upload a CSV of holders and securities. Rows are validated against your share classes, equity plans and vesting templates before anything is written.</CardDescription>
              </div>
              <Button variant="secondary" size="sm" className="shrink-0" asChild>
                <a href={`/api/companies/${C}/import-template`}>
                  <FileSpreadsheet /> Download template
                </a>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Columns: {IMPORT_COLUMNS.map((c) => c.header + (c.required ? "*" : "")).join(" · ")}. Security types accept COMMON_SHARES, PREFERRED_SHARES, OPTION_ISO, OPTION_NSO, RSU, RSA, WARRANT, SAFE, CONVERTIBLE_NOTE (or common, preferred, iso, nso, safe, note…). For SAFEs and notes, quantity is the principal amount.
              </div>
              <ImportCapTable companyId={C} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-col sm:flex-row">
            <div className="min-w-0">
              <CardTitle>Data retention</CardTitle>
              <CardDescription>Ledger entries, documents and the audit log are retained for the life of the company and for 7 years after closure, in line with record-keeping requirements.</CardDescription>
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" asChild>
              <a href={`/app/${C}/audit-log`}>
                <History /> View audit log
              </a>
            </Button>
          </CardHeader>
        </Card>

        {ctx.role === "ADMIN" ? (
          <Card className="border-danger/40">
            <CardHeader className="flex-col sm:flex-row">
              <div className="min-w-0">
                <CardTitle className="text-danger">Danger zone</CardTitle>
                <CardDescription>Deleting the company permanently removes the cap table, documents, valuations and audit history for every member. Export first.</CardDescription>
              </div>
              <FormDialog
                trigger={
                  <Button variant="destructive" size="sm" className="shrink-0">
                    <Trash2 /> Delete company
                  </Button>
                }
                title={`Delete ${ctx.company.name}?`}
                description="This cannot be undone."
                action={deleteCompany}
                hidden={{ companyId: C }}
                submitLabel="Permanently delete"
                destructive
                size="sm"
              >
                <Field label={`Type "${ctx.company.name}" to confirm`}>
                  <Input name="confirmName" autoComplete="off" required />
                </Field>
              </FormDialog>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </>
  );
}
