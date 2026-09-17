import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, light = false, size = 24 }: { className?: string; light?: boolean; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", light ? "text-white" : "text-foreground", className)}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? "#ffffff" : "#1a2b4c"} />
        <path d="M9 21.5V10.5h4.2c2.6 0 4.3 1.3 4.3 3.5s-1.7 3.6-4.3 3.6h-1.7v3.9H9Zm2.5-6h1.6c1.2 0 1.9-.6 1.9-1.5s-.7-1.5-1.9-1.5h-1.6v3Z" fill={light ? "#1a2b4c" : "#ffffff"} />
        <circle cx="21.5" cy="19.5" r="2.5" fill={light ? "#1a2b4c" : "#60a5fa"} />
      </svg>
      <span style={{ fontSize: size * 0.7 }}>Capt</span>
    </span>
  );
}

export function LogoLink({ href = "/", ...props }: { href?: string; className?: string; light?: boolean; size?: number }) {
  return (
    <Link href={href} className="inline-flex">
      <Logo {...props} />
    </Link>
  );
}
