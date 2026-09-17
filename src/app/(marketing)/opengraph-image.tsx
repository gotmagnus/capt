import { ImageResponse } from "next/og";
import { GROUPS, HERO_ROWS, HERO_TOTAL } from "@/lib/marketing/story";

export const alt = "Capt. Every share, accounted for.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLOR = Object.fromEntries(GROUPS.map((g) => [g.key, g.color])) as Record<string, string>;

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0a1430", color: "#ffffff", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 600 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#ffffff", color: "#1a2b4c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, marginRight: 16 }}>P</div>
          Capt
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, lineHeight: 1, letterSpacing: -3, fontWeight: 600 }}>Every share,</div>
          <div style={{ fontSize: 92, lineHeight: 1.05, letterSpacing: -3, fontWeight: 600 }}>accounted for.</div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#cbd5e1" }}>Cap table, grants, 409A, board consents and compliance on one ledger.</div>
        </div>
        <div style={{ display: "flex", width: "100%", height: 28, borderRadius: 6, overflow: "hidden" }}>
          {HERO_ROWS.map((r) => (
            <div key={r.name} style={{ width: `${(r.shares / HERO_TOTAL) * 100}%`, height: "100%", background: COLOR[r.kind], borderRight: "2px solid #0a1430" }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
