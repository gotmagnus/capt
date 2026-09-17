import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Table2,
  Users,
  FileBadge,
  Layers,
  CalendarClock,
  ArrowLeftRight,
  Rocket,
  LineChart,
  Gavel,
  ShieldCheck,
  FolderOpen,
  ClipboardCheck,
  UserPlus,
  Mail,
  Megaphone,
  BarChart3,
  Banknote,
  History,
  Settings,
  PieChart,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string; // relative to /app/[companyId]
  icon: LucideIcon;
  badgeKey?: "openTasks" | "pendingSignatures" | "pendingExercises" | "pendingConsents";
  roles?: string[]; // restrict visibility
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, badgeKey: "openTasks" }],
  },
  {
    title: "Cap table",
    items: [
      { label: "Cap table", href: "/cap-table", icon: Table2 },
      { label: "Stakeholders", href: "/stakeholders", icon: Users },
      { label: "Securities", href: "/securities", icon: FileBadge },
      { label: "Share classes", href: "/share-classes", icon: Layers },
      { label: "Equity plans", href: "/equity-plans", icon: PieChart },
      { label: "Vesting schedules", href: "/vesting-schedules", icon: CalendarClock },
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Fundraising",
    items: [
      { label: "Rounds & convertibles", href: "/fundraising", icon: Rocket },
      { label: "Scenario modeling", href: "/modeling", icon: LineChart },
      { label: "409A valuations", href: "/valuations", icon: BarChart3 },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Board consents", href: "/board", icon: Gavel, badgeKey: "pendingConsents" },
      { label: "Compliance", href: "/compliance", icon: ShieldCheck },
      { label: "Documents", href: "/documents", icon: FolderOpen, badgeKey: "pendingSignatures" },
      { label: "Audit log", href: "/audit-log", icon: History },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Employees", href: "/employees", icon: UserPlus },
      { label: "Exercises", href: "/exercises", icon: ClipboardCheck, badgeKey: "pendingExercises" },
      { label: "Offer letters", href: "/offers", icon: Mail },
      { label: "Investor updates", href: "/updates", icon: Megaphone },
      { label: "Liquidity", href: "/liquidity", icon: Banknote },
    ],
  },
  {
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
