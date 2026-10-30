import { useState, type ReactNode } from "react";
import { NavLink, useMatches } from "react-router";

import { Icon } from "./icons";
import { navItems } from "./nav";
import { NotificationsBell, type StationNotification } from "./NotificationsBell";
import { formatStationDate } from "./station-date";
import type { Track } from "~/platform/analytics/track";
import styles from "./Shell.module.css";

/** Routes name their page in the header with `handle = { title }`, fixed or from their loader data. */
export interface ShellHandle {
  title?: string | ((data: unknown) => string | undefined);
}

export interface ShellProps {
  /** The in-game date, as YYYY-MM-DD. */
  stationDate: string;
  notifications: StationNotification[];
  track: Track;
  children: ReactNode;
}

export function Shell({ stationDate, notifications, track, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const title = usePageTitle();

  function toggleMenu() {
    setCollapsed(!collapsed);
    track("menu_toggled", { collapsed: !collapsed });
  }

  return (
    <div className={styles.shell} data-collapsed={collapsed || undefined}>
      <aside className={styles.sidebar}>
        <div className={styles.rail}>
          <span className={styles.logo}>
            <Icon name="logo" size={26} />
          </span>
          <button
            type="button"
            className={styles.railButton}
            onClick={toggleMenu}
            aria-expanded={!collapsed}
            aria-controls="main-menu"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
          >
            <Icon name={collapsed ? "expand" : "collapse"} size={18} />
          </button>
        </div>

        <nav id="main-menu" className={styles.menu} aria-label="Main menu">
          <div className={styles.brand}>
            Orbital <span className={styles.brandLight}>Books</span>
          </div>
          <div className={styles.menuHeading}>Main menu</div>
          <ul className={styles.menuList}>
            {navItems.map((item) => (
              <li key={item.label}>
                {item.to ? (
                  <NavLink
                    to={item.to}
                    end
                    className={({ isActive }) => (isActive ? `${styles.menuItem} ${styles.active}` : styles.menuItem)}
                    title={collapsed ? item.label : undefined}
                    onClick={() => track("nav_selected", { item: item.label })}
                  >
                    <Icon name={item.icon} />
                    <span className={styles.menuLabel}>{item.label}</span>
                  </NavLink>
                ) : (
                  <span
                    className={`${styles.menuItem} ${styles.soon}`}
                    aria-disabled="true"
                    title={collapsed ? `${item.label} (coming soon)` : undefined}
                  >
                    <Icon name={item.icon} />
                    <span className={styles.menuLabel}>{item.label}</span>
                    <span className={styles.soonBadge}>Soon</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.headerTools}>
            <div className={styles.stationDate}>
              <Icon name="calendar" size={16} />
              <span className={styles.stationDateLabel}>Station date</span>
              <time dateTime={stationDate}>{formatStationDate(stationDate)}</time>
            </div>
            <NotificationsBell notifications={notifications} track={track} />
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}

function usePageTitle(): string {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = (matches[i]?.handle as ShellHandle | undefined)?.title;
    const title = typeof handle === "function" ? handle(matches[i]?.loaderData) : handle;
    if (title) return title;
  }
  return "Orbital Books";
}
