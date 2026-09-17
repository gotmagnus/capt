import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { bodoni } from "@/components/marketing/fonts";
import "./marketing.css";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`mkt ${bodoni.variable} flex min-h-screen flex-col bg-white text-ink`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white">
        Skip to content
      </a>
      <MarketingNav fontClass={bodoni.variable} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
