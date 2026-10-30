import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";

import { Icon } from "./icons";
import type { Track } from "./track";
import styles from "./NotificationsBell.module.css";

export interface StationNotification {
  id: string;
  title: string;
  detail: string;
  unread: boolean;
  /** Where acting on the notification takes the player. */
  to?: string;
}

export function NotificationsBell({ notifications, track }: { notifications: StationNotification[]; track: Track }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const unread = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    if (!open) track("notifications_opened", { count: notifications.length, unread });
    setOpen(!open);
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.bell}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Icon name="bell" />
        {unread > 0 && <span className={styles.dot} aria-hidden="true" />}
      </button>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <div className={styles.panelHeading}>Notifications</div>
        {notifications.length === 0 ? (
          <p className={styles.empty}>Nothing new on the station.</p>
        ) : (
          <ul className={styles.list}>
            {notifications.map((n) => {
              const body = (
                <>
                  <span className={styles.itemIcon}>
                    <Icon name="alert" size={18} />
                  </span>
                  <span>
                    <span className={styles.itemTitle}>{n.title}</span>
                    <span className={styles.itemDetail}>{n.detail}</span>
                  </span>
                  {n.unread && <span className={styles.unread}>New</span>}
                </>
              );
              return (
                <li key={n.id}>
                  {n.to ? (
                    <Link
                      to={n.to}
                      className={styles.item}
                      onClick={() => {
                        track("notification_selected", { id: n.id });
                        setOpen(false);
                      }}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={styles.item}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
