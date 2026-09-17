import type { Metadata } from "next";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { FaqList } from "@/components/marketing/faq";
import { ComparisonTable, PlanColumns } from "@/components/marketing/pricing";
import { SectionHead } from "@/components/marketing/section-head";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Capt is priced per company, per year. Startup, Growth and Enterprise plans, with every feature compared side by side.",
};

export default function PricingPage() {
  return (
    <>
      <section className="pb-20 pt-14 lg:pb-28 lg:pt-20">
        <div className="mkt-container">
          <SectionHead as="h1" title="One price a year.">
            Priced per company, not per seat. Invite your counsel, your finance lead and your whole board without doing arithmetic first. Every plan includes the portals, the audit log and full export.
          </SectionHead>
          <div className="mt-12 lg:mt-20">
            <PlanColumns />
          </div>
        </div>
      </section>

      <section className="border-t border-rule py-20 lg:py-28">
        <div className="mkt-container">
          <SectionHead title="Every feature, side by side." />
          <div className="mt-8 lg:mt-10">
            <ComparisonTable />
          </div>
        </div>
      </section>

      <section id="faq" className="bg-vellum py-20 lg:py-28">
        <div className="mkt-container grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHead title="Questions." />
          </div>
          <div className="lg:col-span-8">
            <FaqList />
          </div>
        </div>
      </section>

      <ClosingCta />
    </>
  );
}
