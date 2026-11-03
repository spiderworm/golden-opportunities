import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { track as platformTrack } from "~/platform/analytics/analytics.client";
import { ASSISTANT_NAME as NAME } from "../name.ts";
import { PORTRAIT } from "./AssistantPanel";

// Dewey's column beside the dashboard (David, 3 Nov: "make the Dewey chat panel wider (by default)", "drag to
// resize (with reasonable min-width)" and "collapseable"). Wider by default; its left edge drags, or takes the arrow
// keys, to resize it; and it folds down to his face, which opens it again. The width and whether it's folded are
// kept in this browser. Below the page's side-column breakpoint he sits after the dashboard, full width, and only
// folds. The panel stays mounted while folded, so an answer still coming keeps coming.

export const COLUMN = { width: 480, min: 340, max: 820, step: 16 } as const;
const KEY = "orbital.dewey.column";

interface Saved {
  width: number;
  folded: boolean;
}

/** The kept width and fold, or the defaults; a width out of range comes back within it. */
export function readColumn(raw: string | null): Saved {
  try {
    const saved = JSON.parse(raw ?? "null") as Partial<Saved> | null;
    const width = typeof saved?.width === "number" ? clampWidth(saved.width) : COLUMN.width;
    return { width, folded: saved?.folded === true };
  } catch {
    return { width: COLUMN.width, folded: false };
  }
}

/** Within the minimum, the maximum and half the window, whichever is less. */
export function clampWidth(width: number, windowWidth = Infinity): number {
  const max = Math.min(COLUMN.max, Math.max(COLUMN.min, windowWidth / 2));
  return Math.round(Math.min(max, Math.max(COLUMN.min, width)));
}

export function DeweyColumn({
  className,
  children,
  track = platformTrack,
}: {
  className?: string;
  children: ReactNode;
  track?: typeof platformTrack;
}) {
  const [column, setColumn] = useState<Saved>({ width: COLUMN.width, folded: false });
  // Read once in the browser: the server draws the defaults.
  useEffect(() => setColumn(readColumn(localStorage.getItem(KEY))), []);
  const keep = (next: Saved) => {
    setColumn(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* Private mode or full: it's only a preference. */
    }
  };
  const fold = (folded: boolean) => {
    keep({ ...column, folded });
    track("assistant_column_folded", { folded });
  };

  // Dragging the left edge: wider to the left, measured from where the drag began.
  const drag = useRef<{ x: number; width: number; now: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const resized = (width: number, via: "drag" | "keys") =>
    track("assistant_column_resized", { width, via });

  const onKey = (e: KeyboardEvent) => {
    const by = e.key === "ArrowLeft" ? COLUMN.step : e.key === "ArrowRight" ? -COLUMN.step : null;
    const to = e.key === "Home" ? COLUMN.min : e.key === "End" ? COLUMN.max : null;
    if (by === null && to === null) return;
    e.preventDefault();
    const width = clampWidth(to ?? column.width + by!, window.innerWidth);
    keep({ ...column, width });
    resized(width, "keys");
  };

  if (column.folded)
    return (
      <aside className={className} aria-label={NAME} data-folded="">
        <button
          type="button"
          data-dewey-unfold=""
          style={styles.unfold}
          aria-expanded={false}
          aria-label={`Open ${NAME}`}
          title={`Open ${NAME}`}
          onClick={() => fold(false)}
        >
          <img src={PORTRAIT} alt="" width={40} height={40} style={styles.unfoldFace} />
          <span data-dewey-name="">{NAME}</span>
        </button>
        {/* Kept mounted, out of sight: an answer still streaming carries on. */}
        <div hidden>{children}</div>
      </aside>
    );

  return (
    <aside
      className={className}
      aria-label={NAME}
      style={{ ["--dewey-width" as string]: `${column.width}px` }}
      data-dragging={dragging || undefined}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${NAME}`}
        aria-valuemin={COLUMN.min}
        aria-valuemax={COLUMN.max}
        aria-valuenow={column.width}
        tabIndex={0}
        data-dewey-resize=""
        style={styles.handle}
        onKeyDown={onKey}
        onDoubleClick={() => {
          keep({ ...column, width: COLUMN.width });
          resized(COLUMN.width, "drag");
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, width: column.width, now: column.width };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const width = clampWidth(
            drag.current.width + drag.current.x - e.clientX,
            window.innerWidth,
          );
          drag.current.now = width;
          setColumn((c) => ({ ...c, width }));
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          // The width it was dragged to, which a quick release can reach before the column has redrawn.
          const width = drag.current.now;
          drag.current = null;
          setDragging(false);
          keep({ ...column, width });
          resized(width, "drag");
        }}
      />
      <button
        type="button"
        style={styles.fold}
        aria-expanded={true}
        aria-label={`Fold ${NAME} away`}
        title={`Fold ${NAME} away`}
        onClick={() => fold(true)}
      >
        {"»"}
      </button>
      {children}
    </aside>
  );
}

const styles = {
  // A strip along the left edge, in the gap between the dashboard and the column.
  handle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -14,
    width: 10,
    cursor: "col-resize",
    touchAction: "none",
    borderRadius: 5,
  },
  fold: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 1,
    width: 28,
    height: 28,
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-control)",
    background: "var(--color-panel)",
    color: "var(--color-text-muted)",
    font: "inherit",
    fontSize: 16,
    lineHeight: 1,
    cursor: "pointer",
  },
  // Laid out by the page: a bar under the dashboard, or beside it a narrow strip with his name running down it.
  unfold: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "12px 6px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-panel)",
    background: "var(--color-panel)",
    color: "var(--color-text)",
    font: "inherit",
    cursor: "pointer",
  },
  unfoldFace: { borderRadius: "50%", background: "#1d2440" },
} satisfies Record<string, React.CSSProperties>;
