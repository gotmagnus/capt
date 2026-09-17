@AGENTS.md

# Capt — project conventions

- Stack: Next.js 16 App Router (Turbopack), React 19, TypeScript strict, Tailwind v4, Prisma 6 + SQLite, vitest. Read `README.md` for the architecture and route map.
- Next 16: `params`/`searchParams`/`cookies()` are async; use the generated `PageProps<"/route">`, `LayoutProps`, `RouteContext` helpers (run `npx next typegen` after adding routes). `src/proxy.ts` replaces middleware.
- Auth: `requireWorkspace(companyId)` in admin pages, `requireEditor(companyId)` inside every mutating server action, `requireCompany(companyId)` in the portal. Always scope queries by `ctx.company.id`.
- Data: compute ownership/vesting/waterfalls only through `src/lib/equity/*` (unit-tested). Load company data with `loadCapTable()` from `src/lib/data/captable.ts`.
- Mutations: `actions.ts` per route with `"use server"`, zod via `parseForm()` from `src/lib/actions.ts`, return `ok()/fail()`, call `logAudit()`, then `revalidatePath()`. Every state change must create the matching `Transaction` row where applicable (issuance, exercise, cancellation, transfer, conversion…).
- UI: primitives in `src/components/ui/*`, forms via `ActionForm`/`FormDialog`/`ConfirmButton` in `src/components/forms.tsx`, tables via `DataTable`, formatting via `src/lib/format.ts`, labels via `src/lib/types.ts`. Match the dashboard's density (13px text, tabular numerals, right-aligned numbers).
- CSS layers: never add unlayered rules to `globals.css` or `marketing.css`. Unlayered CSS beats every Tailwind utility (this once turned all `border-*` colours grey and left-aligned every numeric table header). Resets go in `@layer base`, component classes in `@layer components`.
- Responsive: mobile-first. Multi-column grids need a breakpoint (`grid-cols-1 sm:grid-cols-3`), tab bars use `tabStripClass`/`tabItemClass` from `src/components/ui/tab-styles.ts`, tables sit directly inside a container so `:has(> .data-table)` can scroll them. Check 390px before calling a page done.
- Marketing: `src/app/(marketing)` + `src/components/marketing/*`, scoped under `.mkt` (16px root, Bodoni Moda display via `.mkt-display`). Figures come from `src/lib/marketing/story.ts`, which mirrors the seeded demo company; if the seed changes, update it. No fabricated traction stats, logos or certifications.
- Dev loop: `npm run dev`; `npx tsx scripts/dev-session.ts <email>` prints a session token + company id for `curl -b capt_session=<token>`; `npm test`; `npm run typecheck`; `npm run db:reset` restores the demo data.
