// Line icons for the shell, drawn on a 24px grid with a 1.6px stroke.
const paths = {
  logo: (
    <>
      <path d="M7 6.5h7.5a2 2 0 0 1 2 2v9H9a2 2 0 0 1-2-2z" />
      <path d="M7 15.5a2 2 0 0 1 2-2h7.5" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-24 12 12)" />
    </>
  ),
  station: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-24 12 12)" />
      <circle cx="19.2" cy="7.6" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  investigate: (
    <>
      <path d="M4 19V11M8.5 19V7M13 19v-5" />
      <circle cx="16.5" cy="8.5" r="3.5" />
      <path d="m19 11 2.5 2.5" />
    </>
  ),
  decisions: (
    <>
      <path d="M12 21v-8M12 13 6 7M12 13l6-6" />
      <path d="M6 11V7h4M18 11V7h-4" />
    </>
  ),
  reports: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6M9 9h2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  collapse: <path d="m13 7-5 5 5 5M18 7l-5 5 5 5" />,
  expand: <path d="m6 7 5 5-5 5M11 7l5 5-5 5" />,
  alert: (
    <>
      <path d="M3.5 7 9 13l4-3.5 7.5 8" />
      <path d="M15.5 17.5h5v-5" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.8" />
      <path d="M5 6.5v5.5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6.5M5 12v5.5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V12" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5c2.8-1 5.5-.8 8 1 2.5-1.8 5.2-2 8-1v13c-2.8-1-5.5-.8-8 1-2.5-1.8-5.2-2-8-1z" />
      <path d="M12 6.5v13" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12.5H6z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.5v-8h8l9 9-8 8z" />
      <circle cx="8" cy="9" r="1.4" />
    </>
  ),
  arrowUp: <path d="M7 17 17 7M9 7h8v8" />,
  arrowDown: <path d="M7 7l10 10M17 9v8H9" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
