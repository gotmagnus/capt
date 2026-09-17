import { cn } from "@/lib/utils";

export function SectionHead({ title, children, onInk, as: Tag = "h2" }: { title: string; children?: React.ReactNode; onInk?: boolean; as?: "h1" | "h2" }) {
  return (
    <div className="max-w-3xl">
      <Tag className={cn("mkt-display leading-[1.04]", Tag === "h1" ? "text-[2.75rem] sm:text-6xl lg:text-[4.5rem]" : "text-[2.25rem] sm:text-5xl lg:text-[3.5rem]", onInk ? "text-white" : "text-ink")}>{title}</Tag>
      {children ? <p className={cn("mt-5 max-w-2xl text-[1.0625rem] leading-relaxed sm:text-lg", onInk ? "text-slate-300" : "text-muted-foreground")}>{children}</p> : null}
    </div>
  );
}
