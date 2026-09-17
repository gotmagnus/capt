"use client";

import Link from "next/link";
import { useTransition } from "react";
import { AlertTriangle, CalendarClock, Check, Info, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { date, daysUntil } from "@/lib/format";
import { completeTask } from "./actions";

/**
 * Task copy is written once, when the notification is created, so a phrase like "expires in
 * 29 days" goes stale the next morning and then disagrees with the live due label (and the
 * 409A banner above). Keep any such phrase in step with the due date.
 */
function liveCopy(text: string, days: number | null) {
  if (days === null || days < 0) return text;
  return text.replace(/\bin \d+ days?\b/i, days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`);
}

export function TaskList({ companyId, tasks }: { companyId: string; tasks: { id: string; type: string; title: string; body: string | null; link: string | null; dueDate: string | null }[] }) {
  const [pending, start] = useTransition();
  if (tasks.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-[13px] text-muted-foreground">
        <Check className="mx-auto mb-2 size-5 text-success" /> You're all caught up.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {tasks.map((t) => {
        const days = daysUntil(t.dueDate);
        const title = liveCopy(t.title, days);
        const Icon = t.type === "DEADLINE" ? CalendarClock : t.type === "ALERT" ? AlertTriangle : t.type === "INFO" ? Info : ListTodo;
        return (
          <li key={t.id} className="group flex items-start gap-3 px-3 py-2.5">
            <Icon className={cn("mt-0.5 size-4 shrink-0", t.type === "ALERT" ? "text-warning" : t.type === "DEADLINE" ? "text-danger" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              {t.link ? (
                <Link href={t.link} className="text-[13px] font-medium hover:underline">
                  {title}
                </Link>
              ) : (
                <div className="text-[13px] font-medium">{title}</div>
              )}
              {t.body ? <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{liveCopy(t.body, days)}</p> : null}
              {t.dueDate ? (
                <p className={cn("mt-1 text-[11px]", days !== null && days < 7 ? "text-danger" : "text-muted-foreground")}>
                  Due {date(t.dueDate)}
                  {days !== null ? ` · ${days < 0 ? `${-days}d overdue` : `in ${days}d`}` : ""}
                </p>
              ) : null}
            </div>
            <button
              disabled={pending}
              onClick={() => start(() => completeTask(companyId, t.id))}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-success focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:p-2 pointer-coarse:opacity-100"
              aria-label="Mark done"
            >
              <Check className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
