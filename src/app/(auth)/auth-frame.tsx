import { LogoLink } from "@/components/brand";
import { Guilloche } from "@/components/marketing/guilloche";

/** Split sign-in / sign-up frame: the form, and an ink brand panel from `lg` up. */
export function AuthFrame({ title, body, children }: { title: string; body: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="relative hidden w-[44%] max-w-[44rem] flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex xl:p-14">
        <Guilloche tone="ink" className="mkt-rosette absolute -bottom-[22rem] -right-[18rem] size-[60rem]" />
        <div className="relative">
          <LogoLink light size={28} />
        </div>
        <div className="relative max-w-md">
          <h2 className="mkt-display text-[3.25rem] leading-[0.98] xl:text-[4rem]">{title}</h2>
          <div className="mt-6 text-[15px] leading-relaxed text-slate-300">{body}</div>
        </div>
        <p className="relative text-xs text-slate-500">Capt is software, not a law or accounting firm. Nothing here is legal, tax or investment advice.</p>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center bg-background px-5 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoLink size={28} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
