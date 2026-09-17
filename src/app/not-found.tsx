import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={26} />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-[13px] text-muted-foreground">The page you're looking for doesn't exist or you don't have access to it.</p>
      <Button asChild className="mt-2">
        <Link href="/app">Go to your workspace</Link>
      </Button>
    </div>
  );
}
