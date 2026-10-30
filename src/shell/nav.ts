import type { IconName } from "./icons";

export interface NavItem {
  label: string;
  icon: IconName;
  /** Where the item goes. Items without one are features still to come. */
  to?: string;
}

export const navItems: NavItem[] = [
  { label: "Station", icon: "station", to: "/" },
  { label: "Investigate", icon: "investigate", to: "/investigate" },
  { label: "Decisions", icon: "decisions", to: "/decide" },
  { label: "Reports", icon: "reports" },
  { label: "Settings", icon: "settings" },
];
