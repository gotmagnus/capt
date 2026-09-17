import { ClipboardCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { exercisableGrants } from "@/lib/people-data";
import { money } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui/page";
import { ExercisesTable } from "@/components/people-exercises-table";
import { RecordExerciseDialog } from "@/components/people-record-exercise";

export const metadata = { title: "Exercises" };

export default async function ExercisesPage(props: PageProps<"/app/[companyId]/exercises">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [requests, data, valuation] = await Promise.all([
    db.exerciseRequest.findMany({ where: { companyId: C }, include: { stakeholder: true, security: true }, orderBy: { requestedAt: "desc" } }),
    loadCapTable(C),
    currentValuation(C),
  ]);
  const year = new Date().getFullYear();
  const pending = requests.filter((r) => r.status === "REQUESTED").length;
  const awaitingPayment = requests.filter((r) => ["APPROVED", "PAYMENT_PENDING"].includes(r.status)).length;
  const completedThisYear = requests.filter((r) => r.status === "COMPLETED" && r.completedAt && r.completedAt.getFullYear() === year);
  const proceeds = requests.filter((r) => r.status === "COMPLETED").reduce((a, r) => a + r.totalCost, 0);
  const grants = exercisableGrants(data);
  const rows = requests.map((r) => ({
    id: r.id,
    holder: r.stakeholder.name,
    stakeholderId: r.stakeholderId,
    securityId: r.securityId,
    certificateNumber: r.security.certificateNumber,
    type: r.security.type,
    quantity: r.quantity,
    exercisePrice: r.exercisePrice,
    totalCost: r.totalCost,
    fmv: r.fmvAtExercise,
    method: r.method,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));
  return (
    <>
      <PageHeader
        title="Exercises"
        description="Option and warrant exercises from request to share issuance, with payment tracking and Form 3921 records for ISOs."
        actions={ctx.canEdit ? <RecordExerciseDialog companyId={C} grants={grants} fmv={valuation?.fairMarketValue ?? null} /> : null}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Pending review" value={pending} icon={ClipboardCheck} tone={pending ? "warning" : "default"} />
        <Stat label="Awaiting payment" value={awaitingPayment} />
        <Stat label={`Completed in ${year}`} value={completedThisYear.length} hint={`${completedThisYear.reduce((a, r) => a + r.quantity, 0).toLocaleString()} shares issued`} />
        <Stat label="Exercise proceeds" value={money(proceeds)} hint="All time" tone="success" />
      </div>
      <ExercisesTable companyId={C} rows={rows} />
    </>
  );
}
