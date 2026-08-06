import { Icon, PATHS } from "./icons";
import { hexToRgba, initialsOf } from "../lib/sessionTypes";
import { playerWord, type TeamGender } from "../lib/gender";

export interface TeamCardData {
  id: number;
  name: string;
  category: string;
  color: string;
  players: number;
  sessions: number;
  attendance: number | null;
  gender?: TeamGender;
}

function MiniStat({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? "var(--text-primary)" }}>{value}</div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function TeamCardCompact({ team, onClick }: { team: TeamCardData; onClick?: () => void }) {
  const color = team.color || "#22d3ee";
  return (
    <div className="card card-hover" onClick={onClick} style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: hexToRgba(color, 0.1),
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initialsOf(team.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {team.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {[team.category, `${team.players} ${playerWord(team.gender, team.players !== 1)}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <MiniStat value={team.sessions} label="Sesiones" />
        <MiniStat
          value={team.attendance == null ? "—" : `${team.attendance}%`}
          label="Asistencia"
          color={team.attendance == null ? "var(--text-muted)" : "var(--accent-green)"}
        />
      </div>
    </div>
  );
}

export function AddTeamCard({ onClick }: { onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: "1px dashed var(--text-muted)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: 0.4,
        minHeight: 108,
        cursor: "pointer",
        transition: "opacity 0.2s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
    >
      <Icon d={PATHS.plus} size={18} color="var(--text-secondary)" />
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Añadir equipo</span>
    </div>
  );
}
