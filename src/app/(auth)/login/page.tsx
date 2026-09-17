import Link from "next/link";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <AuthFrame
      title="Every share, accounted for."
      body="The demo company is a Series A robotics business with four years of equity history. Sign in as any of its six people to see exactly what that person sees."
    >
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="text-accent-foreground hover:underline">
          Create your company
        </Link>
      </p>
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
    </AuthFrame>
  );
}
