"use client";

import { useState } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";
import { useScrollFrame } from "./hooks";

const LINKS = [
  { href: "/#ledger", label: "How it works" },
  { href: "/#product", label: "Product" },
  { href: "/#exit", label: "Exit modeling" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
];

/** `fontClass` carries the display-font variable into the menu, which portals outside the layout. */
export function MarketingNav({ fontClass }: { fontClass?: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useScrollFrame(() => {
    const next = window.scrollY > 8;
    setScrolled((prev) => (prev === next ? prev : next));
  });
  return (
    <header className={cn("sticky top-0 z-40 border-b transition-[background-color,border-color] duration-300", scrolled ? "border-rule bg-white" : "border-transparent bg-white/0")}>
      <div className="mkt-container flex h-14 items-center justify-between gap-6 lg:h-16">
        <Link href="/" className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" aria-label="Capt home">
          <Logo size={26} />
        </Link>
        <nav className="hidden items-center gap-8 text-[0.9375rem] text-ink/70 lg:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-sm transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="mkt-btn mkt-btn-ghost hidden h-9 px-3.5 sm:inline-flex">
            Sign in
          </Link>
          <Link href="/login" className="mkt-btn mkt-btn-ink h-9 px-4">
            Open the demo
          </Link>
          <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger className="-mr-2 flex size-10 items-center justify-center rounded-md text-ink hover:bg-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-in" />
              <DialogPrimitive.Content aria-describedby={undefined} className={cn("mkt fixed inset-x-0 top-0 z-50 rounded-b-2xl bg-white px-5 pb-6 shadow-2xl outline-none data-[state=open]:animate-in", fontClass)}>
                <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
                <div className="flex h-14 items-center justify-between">
                  <Logo size={26} />
                  <DialogPrimitive.Close className="-mr-2 flex size-10 items-center justify-center rounded-md text-ink hover:bg-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" aria-label="Close menu">
                    <X className="size-5" />
                  </DialogPrimitive.Close>
                </div>
                <nav className="mt-2 border-b border-rule" aria-label="Main">
                  {LINKS.map((l) => (
                    <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="mkt-display block border-t border-rule py-3.5 text-2xl text-ink">
                      {l.label}
                    </Link>
                  ))}
                </nav>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Link href="/login" onClick={() => setOpen(false)} className="mkt-btn mkt-btn-outline">
                    Sign in
                  </Link>
                  <Link href="/signup" onClick={() => setOpen(false)} className="mkt-btn mkt-btn-ink">
                    Create your company
                  </Link>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </div>
    </header>
  );
}
