import Link from "next/link";
import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

export function NoHoldings({ companyId, isWorkspace, name }: { companyId: string; isWorkspace: boolean; name: string }) {
  return (
    <EmptyState
      icon={Wallet}
      title={`No holdings in this company for ${name}`}
      description={isWorkspace ? "Your login isn't linked to a stakeholder record here, so there's nothing to show in the portal. Link a stakeholder under Settings → Users to see equity from a holder's point of view." : "Your account isn't linked to any equity yet. If you expected to see grants here, ask your company's equity administrator to link your stakeholder record."}
      action={
        isWorkspace ? (
          <Button asChild>
            <Link href={`/app/${companyId}/dashboard`}>Open admin workspace</Link>
          </Button>
        ) : (
          <Button variant="secondary" asChild>
            <Link href={`/portal/${companyId}/help`}>Get help</Link>
          </Button>
        )
      }
      className="mt-10"
    />
  );
}
