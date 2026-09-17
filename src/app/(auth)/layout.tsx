import { bodoni } from "@/components/marketing/fonts";
import "../(marketing)/marketing.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className={`mkt-type ${bodoni.variable}`}>{children}</div>;
}
