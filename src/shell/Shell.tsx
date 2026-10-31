import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { NavLink, useLocation, useMatches, useNavigate } from "react-router";

import { Icon } from "./icons";
import { MusicDock } from "./MusicDock";
import { navItems } from "./nav";
import { NotificationsBell, type StationNotification } from "./NotificationsBell";
import { formatStationDate } from "./station-date";
import { StandingOrder } from "./StandingOrder";
import { Transmission } from "./Transmission";
import type { Track } from "~/platform/analytics/track";
import styles from "./Shell.module.css";

/** Routes name their page in the header with `handle = { title }`, fixed or from their loader data. */
export interface ShellHandle {
  title?: string | ((data: unknown) => string | undefined);
  /** False on the screens that deal with the plan itself, where the standing-order strip would only repeat them. */
  standingOrder?: false;
}

export interface ShellProps {
  /** The in-game date, as YYYY-MM-DD. */
  stationDate: string;
  notifications: StationNotification[];
  /** The Commerce Office's standing order: its transmission plays once, on first arrival at the station, and its strip stays until the plan is in. */
  standingOrder?: { seen: boolean; submitted: boolean };
  /** Records that the transmission was seen, opened or put off, so it doesn't play again; settles once the shell has reloaded. */
  onAlertSeen?: () => Promise<void>;
  track: Track;
  children: ReactNode;
}

export function Shell({ stationDate, notifications, standingOrder, onAlertSeen, track, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const musicLayer = useRef<HTMLDivElement>(null);
  const title = usePageTitle();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const stripHidden = useMatches().some((m) => (m.handle as ShellHandle | undefined)?.standingOrder === false);
  const [memoOpen, setMemoOpen] = useState(false);
  // Once per visit at most, even if recording it failed; the save keeps it to once per game.
  const arrived = useRef(false);
  const pending = standingOrder && !standingOrder.submitted;

  useEffect(() => {
    if (!pending || standingOrder.seen || arrived.current || pathname !== "/") return;
    arrived.current = true;
    setMemoOpen(true);
    track("alert_shown", { via: "arrival" });
  }, [pending, standingOrder?.seen, pathname, track]);

  function closeMemo(action: "open" | "later") {
    setMemoOpen(false);
    track("alert_dismissed", { action });
    return standingOrder?.seen ? undefined : onAlertSeen?.();
  }

  // The ledgers wait for the seen flag to land: a navigation racing it would reload the shell
  // before the save changed, and leave the bell unread (WebKit did, in the M1 e2e).
  function openLedgers(event: MouseEvent<HTMLAnchorElement>) {
    const saving = closeMemo("open");
    if (!saving || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void saving.finally(() => navigate("/investigate"));
  }

  function readMemo() {
    track("alert_strip_clicked", { action: "memo" });
    setMemoOpen(true);
    track("alert_shown", { via: "strip" });
  }

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
          <MusicDock collapsed={collapsed} layer={musicLayer} />
        </nav>
      </aside>

      <div className={styles.main}>
        {/* The full player floats over the page from here; the dock is in the menu. */}
        <div ref={musicLayer} className={styles.musicLayer} />
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
        {pending && !stripHidden && (
          <StandingOrder
            onLedgers={pathname === "/investigate"}
            onReadMemo={readMemo}
            onOpenLedgers={() => track("alert_strip_clicked", { action: "ledgers" })}
          />
        )}
        <main className={styles.content}>{children}</main>
        {standingOrder && <Transmission open={memoOpen} onOpenLedgers={openLedgers} onLater={() => void closeMemo("later")} />}
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
