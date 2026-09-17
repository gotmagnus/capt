import Link from "next/link";
import { Guilloche } from "./guilloche";

export function ClosingCta() {
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      <Guilloche tone="ink" scrollLinked className="mkt-rosette absolute -bottom-[26rem] left-1/2 size-[60rem] -translate-x-1/2 lg:-bottom-[34rem] lg:size-[80rem]" />
      <div className="mkt-container relative py-28 text-center lg:py-40">
        <h2 className="mkt-display mx-auto max-w-3xl text-5xl leading-[0.98] sm:text-7xl lg:text-[5.5rem]">Open the books.</h2>
        <p className="mx-auto mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-slate-300 sm:text-lg">The demo company is already four years old: two rounds, twenty-five grants, a 409A about to expire and a consent waiting on two signatures.</p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/login" className="mkt-btn mkt-btn-light h-12 w-full px-6 sm:w-auto">
            Open the demo company
          </Link>
          <Link href="/signup" className="mkt-btn mkt-btn-onink h-12 w-full px-6 sm:w-auto">
            Create your company
          </Link>
        </div>
      </div>
    </section>
  );
}
