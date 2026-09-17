"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV } from "./nav-config";
import { cn } from "@/lib/utils";

interface Hit {
  type: "page" | "stakeholder" | "security";
  label: string;
  hint?: string;
  href: string;
}

export function CommandPalette({ open, onOpenChange, companyId }: { open: boolean; onOpenChange: (o: boolean) => void; companyId: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const [idx, setIdx] = useState(0);

  const pages = useMemo<Hit[]>(() => NAV.flatMap((s) => s.items.map((i) => ({ type: "page" as const, label: i.label, hint: s.title, href: `/app/${companyId}${i.href}` }))), [companyId]);

  const query = q.trim();
  useEffect(() => {
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/companies/${companyId}/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((data: { hits: Hit[] }) => setRemote({ q: query, hits: data.hits }))
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, companyId]);

  const hits = useMemo(() => {
    const ql = query.toLowerCase();
    const p = ql ? pages.filter((h) => h.label.toLowerCase().includes(ql) || h.hint?.toLowerCase().includes(ql)) : pages.slice(0, 8);
    const remoteHits = query.length >= 2 && remote.q === query ? remote.hits : [];
    return [...remoteHits, ...p].slice(0, 12);
  }, [query, pages, remote]);

  const activeIdx = Math.min(idx, Math.max(0, hits.length - 1));

  const close = (next: boolean) => {
    if (!next) {
      setQ("");
      setIdx(0);
    }
    onOpenChange(next);
  };

  const go = (h: Hit) => {
    close(false);
    router.push(h.href);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md" className="top-[20%] translate-y-0 p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIdx(Math.min(hits.length - 1, activeIdx + 1));
              if (e.key === "ArrowUp") setIdx(Math.max(0, activeIdx - 1));
              if (e.key === "Enter" && hits[activeIdx]) go(hits[activeIdx]);
            }}
            placeholder="Search stakeholders, securities, pages…"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {hits.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">No results</li> : null}
          {hits.map((h, i) => (
            <li key={`${h.type}-${h.href}-${i}`}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px]", i === activeIdx && "bg-muted")}>
                <span className={cn("w-16 shrink-0 text-[10px] uppercase tracking-wide", h.type === "page" ? "text-subtle" : h.type === "stakeholder" ? "text-accent-foreground" : "text-success")}>{h.type}</span>
                <span className="flex-1 truncate">{h.label}</span>
                {h.hint ? <span className="text-xs text-muted-foreground truncate">{h.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
