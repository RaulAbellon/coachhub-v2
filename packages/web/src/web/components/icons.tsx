/**
 * Set de iconos line-art (stroke 1.8) del rediseño Dashboard Pro.
 * Un único componente <Icon d={PATHS.x} /> para toda la app.
 */
export const PATHS = {
  dashboard: "M3 12h7V3H3v9Zm11 9h7v-9h-7v9ZM3 21h7v-6H3v6Zm11-12h7V3h-7v6Z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  teams: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  matches: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 2v20M2 12h20M5 5c4 3 4 11 0 14M19 5c-4 3-4 11 0 14",
  players: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM6 21v-1a6 6 0 0 1 12 0v1",
  chart: "M3 3v18h18M7 16v-5M12 16V8M17 16v-9",
  check: "M20 6 9 17l-5-5",
  plus: "M12 5v14M5 12h14",
  filter: "M3 6h18M7 12h10M10 18h4",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  close: "M18 6 6 18M6 6l12 12",
  trash: "M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6",
  download: "M12 3v12m0 0-4-4m4 4 4-4M4 21h16",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 7v5l3 2",
  pin: "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  doc: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z",
} as const;

export function Icon({
  d,
  size = 18,
  color = "currentColor",
  strokeWidth = 1.8,
}: {
  d: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  );
}

export const HandballIcon = () => <Icon d={PATHS.matches} size={20} />;
