// Dev helper: crawls every internal link reachable from a start URL with a session cookie
// and reports non-200 responses or error boundaries.
// Usage: npx tsx scripts/crawl.ts <token> <startPath> [maxPages]
const [token, start, maxArg] = process.argv.slice(2);
if (!token || !start) {
  console.error("usage: crawl.ts <token> <startPath> [maxPages]");
  process.exit(1);
}
const base = process.env.BASE_URL ?? "http://localhost:3000";
const max = Number(maxArg ?? 400);
const seen = new Set<string>();
const queue: string[] = [start];
const bad: { url: string; status: number | string; note?: string }[] = [];
let ok = 0;

function normalize(href: string) {
  const u = new URL(href, base);
  if (u.origin !== base) return null;
  if (u.pathname.startsWith("/api/")) return null;
  if (u.pathname.startsWith("/_next")) return null;
  u.hash = "";
  return u.pathname + u.search;
}

async function run() {
  while (queue.length && seen.size < max) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    let res: Response;
    try {
      res = await fetch(base + path, { headers: { cookie: `capt_session=${token}` }, redirect: "manual" });
    } catch (e) {
      bad.push({ url: path, status: String(e) });
      continue;
    }
    const html = await res.text();
    if (res.status !== 200) {
      bad.push({ url: path, status: res.status, note: res.headers.get("location") ?? undefined });
      continue;
    }
    if (/Something went wrong|Application error|Internal Server Error/.test(html)) {
      bad.push({ url: path, status: 200, note: "error boundary rendered" });
      continue;
    }
    ok++;
    for (const m of html.matchAll(/href="([^"#]+)"/g)) {
      const n = normalize(m[1].replace(/&amp;/g, "&"));
      if (n && !seen.has(n) && !/\/(logout|signup|login)/.test(n)) queue.push(n);
    }
  }
  console.log(`crawled ${seen.size} pages, ${ok} ok, ${bad.length} problems`);
  for (const b of bad) console.log(`  ${b.status}\t${b.url}${b.note ? `\t(${b.note})` : ""}`);
  process.exit(bad.length ? 1 : 0);
}
run();
