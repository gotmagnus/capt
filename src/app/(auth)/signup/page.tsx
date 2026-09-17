import Link from "next/link";
import { AuthFrame } from "../auth-frame";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create your company" };

export default function SignupPage() {
  return (
    <AuthFrame
      title="Start with a blank ledger."
      body="We create a common stock class and standard vesting schedules for you. Issue your first shares in the wizard, or import an existing cap table from a spreadsheet."
    >
      <h1 className="text-2xl font-semibold tracking-tight">Set up your company</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-accent-foreground hover:underline">
          Sign in
        </Link>
      </p>
      <div className="mt-6">
        <SignupForm />
      </div>
    </AuthFrame>
  );
}
