interface CoachHubLogoProps {
  size?: number;
  color?: string;
}

export default function CoachHubLogo({ size = 40, color = "#FF6B35" }: CoachHubLogoProps) {
  // Regular hexagon points (flat-top orientation)
  const cx = 50, cy = 50, r = 38;
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");

  // X lines inside hexagon
  const pad = 20;
  const strokeW = 7;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hexagon outline */}
      <polygon
        points={points}
        stroke={color}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        fill="none"
      />
      {/* X mark */}
      <line
        x1={cx - pad} y1={cy - pad}
        x2={cx + pad} y2={cy + pad}
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      <line
        x1={cx + pad} y1={cy - pad}
        x2={cx - pad} y2={cy + pad}
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
    </svg>
  );
}
