import { Plus } from "lucide-react";
import { FAQ } from "@/lib/marketing/plans";

/** Native <details> so answers are findable in-page and work without JavaScript. */
export function FaqList() {
  return (
    <div className="border-b border-rule">
      {FAQ.map((f) => (
        <details key={f.q} className="mkt-faq group border-t border-rule">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-[1.0625rem] font-medium text-ink focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            {f.q}
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-rule transition-transform duration-200 group-open:rotate-45 group-focus-visible:ring-2 group-focus-visible:ring-ring/40">
              <Plus className="size-4" />
            </span>
          </summary>
          <p className="max-w-2xl pb-6 text-[0.9375rem] leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
