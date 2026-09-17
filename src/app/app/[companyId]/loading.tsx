import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {/* Mirrors the stat rows on the workspace pages: 2-up (last spans), 3 + 2, then 5-up. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 sm:gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className={i < 3 ? "h-20 sm:col-span-2 xl:col-span-1" : i === 3 ? "h-20 sm:col-span-3 xl:col-span-1" : "col-span-2 h-20 sm:col-span-3 xl:col-span-1"} />
        ))}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-56" />
    </div>
  );
}
