interface CoachHubLogoProps {
  size?: number;
  color?: string;
}

export default function CoachHubLogo({ size = 40, color = "#ffffff" }: CoachHubLogoProps) {
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

/**
 * Marca en cuadrado con gradiente cyan→púrpura (Dashboard Pro).
 * Usada en la sidebar compacta, el login y cualquier cabecera de marca.
 */
export function CoachHubMark({ size = 44, radius = 14 }: { size?: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--accent-gradient)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px var(--accent-glow)",
        flexShrink: 0,
      }}
    >
      <CoachHubLogo size={Math.round(size * 0.5)} color="#ffffff" />
    </div>
  );
}
