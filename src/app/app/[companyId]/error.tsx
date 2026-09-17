"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CompanyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-8 text-center">
      <AlertTriangle className="mx-auto size-6 text-danger" />
      <h2 className="mt-3 text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{error.message || "An unexpected error occurred while loading this page."}</p>
      {error.digest ? <p className="mt-2 font-mono text-[11px] text-subtle">Ref {error.digest}</p> : null}
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
