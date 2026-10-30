import styles from "./StationView.module.css";

/**
 * The station as a still picture: shown while the 3D scene loads, and
 * instead of it where WebGL 2 isn't available. Plain SVG, so it costs
 * nothing to draw.
 */
export function StationPoster({ note }: { note?: string }) {
  return (
    <div className={styles.poster}>
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" role="img" aria-label="The station in orbit above a blue planet">
        <defs>
          <radialGradient id="poster-planet" cx="35%" cy="25%" r="75%">
            <stop offset="0%" stopColor="#3f7fb8" />
            <stop offset="55%" stopColor="#173a6b" />
            <stop offset="100%" stopColor="#060b1c" />
          </radialGradient>
          <radialGradient id="poster-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd59a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffd59a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="800" height="450" fill="#03050d" />
        {STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#dfe4ff" opacity={0.5 + (i % 3) * 0.2} />
        ))}
        <circle cx="560" cy="980" r="700" fill="url(#poster-planet)" />
        <circle cx="560" cy="980" r="712" fill="none" stroke="#7f8cff" strokeOpacity="0.35" strokeWidth="10" />
        <g transform="translate(330 190)">
          <ellipse rx="190" ry="48" fill="none" stroke="#c3c8d8" strokeWidth="12" />
          <rect x="-12" y="-60" width="24" height="120" rx="6" fill="#c3c8d8" />
          <rect x="-150" y="-62" width="300" height="5" fill="#7d8398" />
          <rect x="-150" y="-70" width="110" height="20" fill="#1c2c66" stroke="#5a76c9" />
          <rect x="40" y="-70" width="110" height="20" fill="#1c2c66" stroke="#5a76c9" />
          <rect x="-26" y="38" width="52" height="22" rx="3" fill="#c3c8d8" />
          <rect x="-20" y="43" width="40" height="11" fill="#ffd59a" />
          <circle cx="0" cy="49" r="40" fill="url(#poster-glow)" />
        </g>
      </svg>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}

const STARS: [number, number, number][] = Array.from({ length: 70 }, (_, i) => [
  (i * 397) % 800,
  (i * 211) % 300,
  i % 7 === 0 ? 1.6 : 0.9,
]);
