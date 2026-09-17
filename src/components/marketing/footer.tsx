import Link from "next/link";
import { Logo } from "@/components/brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#ledger", label: "How it works" },
      { href: "/#product", label: "What's inside" },
      { href: "/#exit", label: "Exit modeling" },
      { href: "/#roles", label: "Roles and access" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/security", label: "Security" },
      { href: "/pricing#faq", label: "Questions" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/login", label: "Open the demo company" },
      { href: "/signup", label: "Create your company" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-ink text-slate-300">
      <div className="mkt-container grid gap-10 border-t border-white/10 py-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo light size={26} />
          <p className="mt-4 max-w-xs text-[0.9375rem] leading-relaxed text-slate-400">The cap table your founders, counsel, board and team all read from.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <div className="text-sm font-medium text-white">{c.title}</div>
              <ul className="mt-4 space-y-2.5 text-[0.9375rem]">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-slate-400 transition-colors hover:text-white focus-visible:text-white focus-visible:underline focus-visible:outline-none">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="mkt-container flex flex-col gap-2 border-t border-white/10 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Capt</span>
        <span>Capt is software, not a law or accounting firm. Nothing here is legal, tax or investment advice.</span>
      </div>
    </footer>
  );
}
