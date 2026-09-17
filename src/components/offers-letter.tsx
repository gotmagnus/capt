import { Markdown } from "@/components/markdown";
import { PROSE_FIXES } from "@/components/people-labels";
import { cn } from "@/lib/utils";

/**
 * Offer letter body. The letter's terms table has no header row and short row labels, so hide the
 * empty <thead> bar and keep the label column on one line (it wrapped to "Base / salary" on phones).
 */
export function OfferLetter({ content, className }: { content: string; className?: string }) {
  return <Markdown content={content} className={cn(PROSE_FIXES, "[&_td:first-child]:whitespace-nowrap [&_td:first-child]:text-muted-foreground", className)} />;
}
