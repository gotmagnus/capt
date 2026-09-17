"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion, useScrollFrame } from "./hooks";

interface Band {
  /** Mean radius, amplitude: fractions of the rosette radius. */
  r: number;
  a: number;
  /** Lobes around the ring, and how many phase-shifted strands braid the band. */
  lobes: number;
  strands: number;
  /** Secondary modulation that makes the lace swell and tighten. */
  swell: number;
  dir: 1 | -1;
}

// The lacework engraved on stock certificates and banknotes: braided sine rings.
const ROSETTE: Band[] = [
  { r: 0.93, a: 0.045, lobes: 36, strands: 6, swell: 0, dir: 1 },
  { r: 0.78, a: 0.085, lobes: 20, strands: 9, swell: 4, dir: -1 },
  { r: 0.56, a: 0.11, lobes: 14, strands: 9, swell: 2, dir: 1 },
  { r: 0.33, a: 0.085, lobes: 9, strands: 8, swell: 3, dir: -1 },
  { r: 0.15, a: 0.05, lobes: 6, strands: 6, swell: 0, dir: 1 },
];

const SEAL: Band[] = [
  { r: 0.86, a: 0.12, lobes: 12, strands: 3, swell: 0, dir: 1 },
  { r: 0.5, a: 0.17, lobes: 8, strands: 4, swell: 0, dir: -1 },
  { r: 0.17, a: 0.09, lobes: 5, strands: 3, swell: 0, dir: 1 },
];

function draw(canvas: HTMLCanvasElement, bands: Band[], stroke: string, lineWidth: number, phase: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth * dpr;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 2 * dpr;
  const steps = R > 260 * dpr ? 720 : 360;
  for (const b of bands) {
    for (let k = 0; k < b.strands; k++) {
      const shift = (k / b.strands) * Math.PI * 2 + phase * b.dir;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const swell = b.swell ? 0.72 + 0.28 * Math.cos(b.swell * t + phase * 0.5) : 1;
        const r = R * (b.r + b.a * swell * Math.sin(b.lobes * t + shift));
        const x = cx + r * Math.cos(t);
        const y = cy + r * Math.sin(t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

/**
 * Decorative guilloché rosette drawn on a canvas (keeps ~40 long paths out of the HTML).
 * With `scrollLinked`, the strands slide against each other as the page scrolls.
 */
export function Guilloche({
  variant = "rosette",
  tone = "paper",
  scrollLinked = false,
  className,
}: {
  variant?: "rosette" | "seal";
  tone?: "paper" | "ink";
  scrollLinked?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const bands = variant === "seal" ? SEAL : ROSETTE;
  const stroke = tone === "ink" ? "rgba(147, 176, 255, 0.34)" : variant === "seal" ? "rgba(29, 78, 216, 0.55)" : "rgba(29, 78, 216, 0.26)";
  const lineWidth = variant === "seal" ? 0.8 : 0.6;
  const visible = useRef(true);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => draw(canvas, bands, stroke, lineWidth, 0);
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    const io = new IntersectionObserver((entries) => {
      visible.current = entries.some((e) => e.isIntersecting);
    });
    io.observe(canvas);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, [bands, stroke, lineWidth]);

  useScrollFrame(() => {
    const canvas = ref.current;
    if (!scrollLinked || reduced || !canvas || !visible.current) return;
    draw(canvas, bands, stroke, lineWidth, window.scrollY / 520);
  });

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none block", className)} />;
}
