import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { NavLink, useLocation, useMatches, useNavigate } from "react-router";

import { Icon } from "./icons";
import { MusicDock } from "./MusicDock";
import { navItems, type NavCounts } from "./nav";
import { NotificationsBell, type StationNotification } from "./NotificationsBell";
import { formatStationDate } from "./station-date";
import { ALERT_COPY, q2AlertCopy, type AlertCopy, type FirstQuarter } from "./alert-copy";
import { StandingOrder } from "./StandingOrder";
import { StandingOrderShown } from "./standing-order-shown";
import { Transmission } from "./Transmission";
import type { Track } from "~/platform/analytics/track";
import type { QuarterId } from "~/game/quarters";
import styles from "./Shell.module.css";

/** Routes name their page in the header with `handle = { title }`, fixed or from their loader data. */
export interface ShellHandle {
  title?: string | ((data: unknown) => string | undefined);
  /** False on the screens that deal with the plan itself, where the standing-order strip would only repeat them. */
  standingOrder?: false;
  /** A page that is one full scene (Decide): the content area keeps only thin padding, so the scene can fill the window. */
  bleed?: true;
}

export interface ShellProps {
  /** The in-game date, as YYYY-MM-DD. */
  stationDate: string;
  notifications: StationNotification[];
  /**
   * The Commerce Office's standing order for the quarter being planned: its transmission plays once, on
   * first arrival at the station, and its strip stays until the plan is in. Q1's memo unless `quarter` says Q2.
   */
  standingOrder?: {
    seen: boolean;
    submitted: boolean;
    quarter?: QuarterId | null;
    memo?: AlertCopy | null;
  };
  /** Q1's report card, which Q2's memo quotes. */
  q1?: FirstQuarter | null;
  /** Records that the transmission was seen, opened or put off, so it doesn't play again; settles once the shell has reloaded. */
  onAlertSeen?: () => Promise<void>;
  track: Track;
  /** The nav items' badges: Reports counts its new shop reports. */
  counts?: NavCounts;
  children: ReactNode;
}

export function Shell({
  stationDate,
  notifications,
  standingOrder,
  q1,
  onAlertSeen,
  track,
  counts = {},
  children,
}: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const musicLayer = useRef<HTMLDivElement>(null);
  const title = usePageTitle();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const matches = useMatches();
  const stripHidden = matches.some(
    (m) => (m.handle as ShellHandle | undefined)?.standingOrder === false,
  );
  const bleed = matches.some((m) => (m.handle as ShellHandle | undefined)?.bleed);
  const [memoOpen, setMemoOpen] = useState(false);
  // Each quarter's memo (q2.md section 2): Q2's quotes Q1's report card, so it waits for it.
  const quarter = standingOrder?.quarter ?? "2194-Q1";
  // From Q3 the server builds each quarter's memo from Alma's record (later-memo.server.ts); null until it's saved.
  const copy =
    standingOrder?.memo !== undefined
      ? standingOrder.memo
      : quarter === "2194-Q2"
        ? q1
          ? q2AlertCopy(q1)
          : null
        : ALERT_COPY;
  // Once per quarter per visit at most, even if recording it failed; the save keeps it to once per game.
  const arrived = useRef<string | null>(null);
  const pending = standingOrder && !standingOrder.submitted && copy !== null;
  const stripShown = pending && !stripHidden;

  useEffect(() => {
    if (!pending || standingOrder.seen || arrived.current === quarter || pathname !== "/") return;
    arrived.current = quarter;
    setMemoOpen(true);
    track("alert_shown", { via: "arrival", quarter });
  }, [pending, standingOrder?.seen, quarter, pathname, track]);

  function closeMemo(action: "open" | "later") {
    setMemoOpen(false);
    track("alert_dismissed", { action, quarter });
    return standingOrder?.seen ? undefined : onAlertSeen?.();
  }

  // The ledgers wait for the seen flag to land: a navigation racing it would reload the shell
  // before the save changed, and leave the bell unread (WebKit did, in the M1 e2e).
  function openLedgers(event: MouseEvent<HTMLAnchorElement>) {
    const saving = closeMemo("open");
    if (
      !saving ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void saving.finally(() => navigate("/investigate"));
  }

  function readMemo() {
    track("alert_strip_clicked", { action: "memo", quarter });
    setMemoOpen(true);
    track("alert_shown", { via: "strip", quarter });
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

        <div className={styles.menu}>
          <nav id="main-menu" className={styles.menuNav} aria-label="Main menu">
            <div className={styles.brand}>
              Orbital <span className={styles.brandLight}>Books</span>
            </div>
            <div className={styles.menuHeading}>Main menu</div>
            <ul className={styles.menuList}>
              {navItems.map((item) => {
                const count = (item.count && counts[item.count]) || 0;
                const label = count ? `${item.label}, ${count} new` : item.label;
                return (
                  <li key={item.label}>
                    <NavLink
                      to={item.to}
                      end
                      className={({ isActive }) =>
                        isActive ? `${styles.menuItem} ${styles.active}` : styles.menuItem
                      }
                      aria-label={count ? label : undefined}
                      title={collapsed ? label : undefined}
                      onClick={() => track("nav_selected", { item: item.label })}
                    >
                      <Icon name={item.icon} />
                      <span className={styles.menuLabel}>{item.label}</span>
                      {count > 0 && (
                        <span className={styles.countBadge} aria-hidden="true">
                          {count}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
          {/* Beside the menu's landmark, not in it (Chart): the music isn't navigation. */}
          <MusicDock collapsed={collapsed} layer={musicLayer} />
        </div>
      </aside>

      <div className={styles.main} data-bleed={bleed || undefined}>
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
        {stripShown && (
          <StandingOrder
            copy={copy.strip}
            onLedgers={pathname === "/investigate"}
            onReadMemo={readMemo}
            onOpenLedgers={() => track("alert_strip_clicked", { action: "ledgers", quarter })}
            onWritePlan={
              pathname === "/investigate"
                ? () => track("investigate_plan_link", { to: "decide" })
                : undefined
            }
          />
        )}
        <main className={styles.content}>
          <StandingOrderShown value={!!stripShown}>{children}</StandingOrderShown>
        </main>
        {standingOrder && copy && (
          <Transmission
            open={memoOpen}
            copy={copy.transmission}
            onOpenLedgers={openLedgers}
            onLater={() => void closeMemo("later")}
          />
        )}
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
