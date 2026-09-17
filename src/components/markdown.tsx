import { marked } from "marked";
import { cn } from "@/lib/utils";

marked.setOptions({ gfm: true, breaks: true });

export function Markdown({ content, className }: { content: string; className?: string }) {
  const html = marked.parse(content) as string;
  // Long tokens wrap and an over-wide table scrolls inside the document instead of stretching the page.
  return <div className={cn("prose-doc min-w-0 max-w-full overflow-x-auto break-words", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
