import { Icon } from "./icons";
import { hexToRgba } from "../lib/sessionTypes";

export function StatCard({
  icon,
  color,
  value,
  label,
  onClick,
}: {
  icon: string;
  color: string;
  value: string | number;
  label: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={onClick ? "card card-hover" : "card"}
      onClick={onClick}
      style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: hexToRgba(color, 0.1),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon d={icon} size={19} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function StatsStrip({ children }: { children: React.ReactNode }) {
  return <div className="stats-strip">{children}</div>;
}
