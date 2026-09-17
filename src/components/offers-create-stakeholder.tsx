"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DescriptionList } from "@/components/ui/page";
import { FormDialog } from "@/components/forms";
import { createStakeholderFromOffer } from "@/app/app/[companyId]/offers/actions";

export function CreateStakeholderDialog({ companyId, offerId, candidateName, linked, items }: { companyId: string; offerId: string; candidateName: string; linked: boolean; items: { label: string; value: string }[] }) {
  return (
    <FormDialog
      trigger={
        <Button>
          Create stakeholder & grant <ArrowRight />
        </Button>
      }
      title="Create stakeholder & grant"
      description={`${linked ? "Opens" : `Creates an employee record for ${candidateName} and opens`} the issuance wizard pre-filled with the accepted package.`}
      action={createStakeholderFromOffer}
      hidden={{ companyId, id: offerId }}
      submitLabel="Continue"
      size="sm"
      redirectTo={(r) => r.data?.url ?? `/app/${companyId}/offers/${offerId}`}
    >
      <DescriptionList columns={2} items={items} />
    </FormDialog>
  );
}
