import type { Metadata } from "next";
import Link from "next/link";
import { Guilloche } from "@/components/marketing/guilloche";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { HeroSheet } from "@/components/marketing/hero-sheet";
import { DilutionStory } from "@/components/marketing/dilution-story";
import { ProductIndex } from "@/components/marketing/product-index";
import { ExitWaterfall } from "@/components/marketing/exit-waterfall";
import { RoleMatrix } from "@/components/marketing/role-matrix";
import { PlanColumns } from "@/components/marketing/pricing";
import { SectionHead } from "@/components/marketing/section-head";

export const metadata: Metadata = {
  title: { absolute: "Capt. Every share, accounted for." },
  description: "Cap table, option grants, SAFEs, 409A valuations, board consents and compliance on one ledger that founders, counsel, investors and employees all read from.",
};

export default function HomePage() {
  return (
    <>
      <section className="relative -mt-14 overflow-hidden pt-14 lg:-mt-16 lg:pt-16">
        <Guilloche scrollLinked className="mkt-rosette absolute -right-[22rem] -top-[20rem] size-[64rem] sm:-right-[16rem] lg:-right-[10rem] lg:-top-[24rem] lg:size-[76rem]" />
        <div className="mkt-container relative grid items-center gap-12 pb-20 pt-12 sm:pt-16 lg:grid-cols-12 lg:gap-10 lg:pb-28 lg:pt-20">
          <div className="lg:col-span-6">
            <h1 className="mkt-display mkt-rise text-[3.25rem] leading-[0.96] text-ink sm:text-7xl lg:text-[4.5rem] xl:text-[5.25rem]">Every share, accounted for.</h1>
            <p className="mkt-rise mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-ink/70 sm:text-lg" style={{ ["--d" as string]: 120 }}>
              Capt keeps your cap table, option grants, SAFEs, 409A valuations, board consents and compliance on one ledger. Founders, counsel, investors and employees all read the same numbers.
            </p>
            <div className="mkt-rise mt-9 flex flex-col gap-3 sm:flex-row" style={{ ["--d" as string]: 220 }}>
              <Link href="/login" className="mkt-btn mkt-btn-ink h-12 px-6">
                Open the demo company
              </Link>
              <Link href="/signup" className="mkt-btn mkt-btn-outline h-12 px-6">
                Create your company
              </Link>
            </div>
            <p className="mkt-rise mt-6 max-w-md text-sm leading-relaxed text-muted-foreground" style={{ ["--d" as string]: 300 }}>
              The demo is a Series A robotics company with four years of history. Sign in as its CEO, its counsel, a board member, an employee or an investor.
            </p>
          </div>
          <div className="mkt-rise lg:col-span-6" style={{ ["--d" as string]: 160 }}>
            <HeroSheet />
          </div>
        </div>
      </section>

      <section id="ledger" className="bg-ink pb-10 pt-24 text-white lg:pb-16 lg:pt-32">
        <div className="mkt-container">
          <SectionHead title="Follow one company from a blank ledger to its Series A." onInk>
            These are the demo company&rsquo;s own snapshots. Scroll, and the ledger rewinds to each date: who held what, and how much of the company it was.
          </SectionHead>
          <div className="mt-10 lg:mt-4">
            <DilutionStory />
          </div>
        </div>
      </section>

      <section id="product" className="py-24 lg:py-32">
        <div className="mkt-container">
          <SectionHead title="What&rsquo;s inside.">Eight parts with one ledger underneath them, so a grant approved by the board is the same grant the employee sees and the auditor exports. Every figure below comes from the demo company.</SectionHead>
          <div className="mt-12 lg:mt-16">
            <ProductIndex />
          </div>
        </div>
      </section>

      <section id="exit" className="bg-vellum py-24 lg:py-32">
        <div className="mkt-container">
          <SectionHead title="Know who gets paid before you sign.">
            Liquidation preferences decide a sale years before it happens. Drag the price and watch the same cap table pay out differently. This is the waterfall engine from the product, running in your browser.
          </SectionHead>
          <div className="mt-12 lg:mt-16">
            <ExitWaterfall />
          </div>
        </div>
      </section>

      <section id="roles" className="py-24 lg:py-32">
        <div className="mkt-container">
          <SectionHead title="One ledger. Six ways in.">Everyone works from the same record and sees only their part of it. Pick a role to see what it can reach.</SectionHead>
          <div className="mt-10 lg:mt-12">
            <RoleMatrix />
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-rule py-24 lg:py-32">
        <div className="mkt-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead title="One price a year." />
            <Link href="/pricing" className="text-[0.9375rem] font-medium text-accent-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
              Compare every feature
            </Link>
          </div>
          <div className="mt-12 lg:mt-16">
            <PlanColumns />
          </div>
        </div>
      </section>

      <ClosingCta />
    </>
  );
}
