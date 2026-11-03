import type { IconName } from "./icons";

export interface NavItem {
  label: string;
  icon: IconName;
  /** Where the item goes. Items without one are features still to come. */
  to?: string;
  /** Which of the shell's counts it shows as a badge, gone at zero (Reports: its new shop reports). */
  count?: keyof NavCounts;
}

/** The counts nav items can show. */
export interface NavCounts {
  reports?: number;
}

export const navItems: NavItem[] = [
  { label: "Station", icon: "station", to: "/" },
  { label: "Investigate", icon: "investigate", to: "/investigate" },
  { label: "Decisions", icon: "decisions", to: "/decide" },
  { label: "Reports", icon: "reports", to: "/reports", count: "reports" },
  { label: "Settings", icon: "settings", to: "/settings" },
];
