import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import { useIsMobile } from "../hooks/useIsMobile";
import McSelector from "./McSelector";
import { SectionLabel, LinkAction } from "./Panel";
import { hexToRgba, sessionStyle, MATCH_COLOR } from "../lib/sessionTypes";
import { monthMicrocycles, findMicrocycleIndex, toISODate, weekLabel } from "../lib/microcycles";

interface Session {
  id: number;
  title: string;
  date: string;
  teamId: number;
  duration: number;
  sessionType: string;
  microcycle: number;
  notes?: string;
}

interface Team {
  id: number;
  name: string;
  color: string;
  category: string;
}

interface Match {
  id: number;
  teamId: number;
  date: string;
  time: string;
  opponent: string;
  homeAway: string;
}

const DAY_NAMES_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAY_NAMES_MOBILE = ["L", "M", "X", "J", "V", "S", "D"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const DEFAULT_TEAM_COLOR = "#22d3ee";

/** "2026-08-26" → "26 ago" */
function fmtShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  if (!m || !d) return dateStr;
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "2026-08-26" → "Miércoles, 26 de agosto" */
function fmtLong(dateStr: string): string {
  const txt = new Date(dateStr + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** Widget de microciclo del Dashboard: 1 microciclo a la vez, grid de 7 días. */
export default function MicrocycleWidget() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();

  const now = new Date();
  const todayStr = toISODate(now);
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const { data, isLoading } = useQuery({
    queryKey: ["mc-widget-sessions", monthStr],
    queryFn: async () => {
      const res = await authFetch(`/api/sessions/all-teams?month=${monthStr}`, {}, token);
      return res.json() as Promise<{ sessions: Session[]; teams: Team[] }>;
    },
    enabled: !!user,
  });

  const { data: matchesData } = useQuery({
    queryKey: ["mc-widget-matches", monthStr],
    queryFn: async () => {
      const res = await authFetch(`/api/matches/all-teams?month=${monthStr}`, {}, token);
      return res.json() as Promise<{ matches: Match[] }>;
    },
    enabled: !!user,
  });

  const sessions = data?.sessions ?? [];
  const teams = data?.teams ?? [];
  const matches = matchesData?.matches ?? [];
  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

  const weeks = useMemo(() => monthMicrocycles(year, month, sessions), [year, month, sessions]);
  const currentIdx = useMemo(() => {
    const idx = findMicrocycleIndex(weeks, todayStr);
    return idx >= 0 ? idx : 0;
  }, [weeks, todayStr]);

  // Índice del MC visible. null = todavía sin tocar → se sigue al MC actual.
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const mcIndex = Math.min(pickedIdx ?? currentIdx, Math.max(0, weeks.length - 1));
  const activeWeek = weeks[mcIndex];

  // Día seleccionado. null = hoy si cae en la semana, si no el lunes.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const weekDates = activeWeek?.dates ?? [];
  const selectedDate =
    pickedDate && weekDates.includes(pickedDate)
      ? pickedDate
      : weekDates.includes(todayStr)
        ? todayStr
        : (weekDates[0] ?? todayStr);

  // Actividades (sesiones + partidos) por fecha, dentro de la semana activa.
  type Activity =
    | { kind: "session"; id: number; date: string; teamId: number; title: string; meta: string; type: string }
    | { kind: "match"; id: number; date: string; teamId: number; title: string; meta: string; time: string };

  const activityMap = useMemo(() => {
    const inWeek = new Set(weekDates);
    const map: Record<string, Activity[]> = {};
    const push = (a: Activity) => {
      if (!inWeek.has(a.date)) return;
      (map[a.date] ??= []).push(a);
    };
    for (const m of matches) {
      push({
        kind: "match",
        id: m.id,
        date: m.date,
        teamId: m.teamId,
        title: `${m.homeAway === "home" ? "vs" : "@"} ${m.opponent || "Rival"}`,
        meta: m.homeAway === "home" ? "Local" : "Visitante",
        time: (m.time || "").trim(),
      });
    }
    for (const s of sessions) {
      push({
        kind: "session",
        id: s.id,
        date: s.date,
        teamId: s.teamId,
        title: s.title,
        meta: `${s.duration ?? 0} min`,
        type: s.sessionType,
      });
    }
    // Partidos primero (llevan hora), luego sesiones.
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "match" ? -1 : 1));
    }
    return map;
  }, [sessions, matches, weekDates]);

  const weekCount = weekDates.reduce((acc, d) => acc + (activityMap[d]?.length ?? 0), 0);
  const selectedActivities = activityMap[selectedDate] ?? [];
  const dayNames = isMobile ? DAY_NAMES_MOBILE : DAY_NAMES_SHORT;

  const handleMcChange = (mcNumber: number) => {
    const idx = mcNumber - 1;
    if (idx >= 0 && idx < weeks.length) {
      setPickedIdx(idx);
      setPickedDate(null);
    }
  };

  const openActivity = (a: Activity) =>
    navigate(a.kind === "match" ? `/matches/${a.id}` : `/sessions/${a.id}`);

  if (!activeWeek) return null;

  const selector = (
    <McSelector
      activeMc={mcIndex + 1}
      onChange={handleMcChange}
      totalMc={weeks.length}
      labels={weeks.map(weekLabel)}
      currentMc={currentIdx + 1}
      showAll={false}
      compact={isMobile}
    />
  );

  return (
    <section>
      <SectionLabel
        right={
          isMobile ? (
            <LinkAction onClick={() => navigate("/calendar")}>Ver calendario</LinkAction>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {selector}
              <LinkAction onClick={() => navigate("/calendar")}>Ver calendario</LinkAction>
            </div>
          )
        }
      >
        Microciclo
      </SectionLabel>

      {/* En móvil el selector va en su propia fila scrolleable para que no se corte. */}
      {isMobile && (
        <div style={{ display: "flex", overflowX: "auto", paddingBottom: 12, scrollbarWidth: "none" }}>
          {selector}
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        {/* Cabecera del MC */}
        <div
          style={{
            padding: isMobile ? "14px 16px" : "16px 22px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(34,211,238,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: "var(--accent)" }}>
                  {weekLabel(activeWeek)}
                </span>
                {mcIndex === currentIdx && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "rgba(34,211,238,0.1)",
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Actual
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {fmtShort(weekDates[0]!)} – {fmtShort(weekDates[6]!)} · {weekCount}{" "}
                {weekCount === 1 ? "actividad" : "actividades"}
              </p>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {teams.slice(0, 4).map((t) => {
                const color = t.color || DEFAULT_TEAM_COLOR;
                return (
                  <span
                    key={t.id}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: hexToRgba(color, 0.15),
                      border: `1px solid ${hexToRgba(color, 0.35)}`,
                      color,
                    }}
                  >
                    {t.name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ padding: isMobile ? "14px 16px" : "16px 22px" }}>
          {/* Grid de 7 días */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: isMobile ? 4 : 6,
              marginBottom: isMobile ? 12 : 16,
            }}
          >
            {weekDates.map((dateStr, idx) => {
              const dayNum = Number(dateStr.slice(8, 10));
              const dayActivities = activityMap[dateStr] ?? [];
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => setPickedDate(dateStr)}
                  aria-pressed={isSelected}
                  style={{
                    background: isSelected ? "rgba(34,211,238,0.08)" : "var(--bg-secondary)",
                    border: `1px solid ${isSelected ? "rgba(34,211,238,0.3)" : "var(--border)"}`,
                    borderRadius: 10,
                    padding: isMobile ? "6px 2px" : "8px 4px",
                    textAlign: "center",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>
                    {dayNames[idx]}
                  </div>
                  <div
                    style={{
                      width: isMobile ? 26 : 28,
                      height: isMobile ? 26 : 28,
                      borderRadius: "50%",
                      background: isToday ? "var(--accent)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: isMobile ? 13 : 14,
                        fontWeight: isToday ? 800 : 600,
                        color: isToday ? "#09090b" : "var(--text-primary)",
                      }}
                    >
                      {dayNum}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 2, justifyContent: "center", minHeight: 5 }}>
                    {dayActivities.slice(0, 3).map((a) => (
                      <div
                        key={`${a.kind}-${a.id}`}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: a.kind === "match" ? 1.5 : "50%",
                          background:
                            a.kind === "match" ? MATCH_COLOR : (teamMap[a.teamId]?.color || DEFAULT_TEAM_COLOR),
                        }}
                      />
                    ))}
                    {dayActivities.length > 3 && (
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Actividades del día seleccionado */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: isMobile ? 10 : 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                {fmtLong(selectedDate)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {selectedActivities.length} {selectedActivities.length === 1 ? "actividad" : "actividades"}
              </span>
            </div>

            {selectedActivities.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 6 : 8 }}>
                {selectedActivities.map((a) => {
                  const team = teamMap[a.teamId];
                  const teamColor = team?.color || DEFAULT_TEAM_COLOR;
                  const label =
                    a.kind === "match" ? "Partido" : sessionStyle(a.type).name;
                  const labelColor = a.kind === "match" ? MATCH_COLOR : "var(--text-muted)";

                  return (
                    <div
                      key={`${a.kind}-${a.id}`}
                      onClick={() => openActivity(a)}
                      className="row-hover"
                      style={{
                        display: "flex",
                        gap: isMobile ? 10 : 12,
                        alignItems: "flex-start",
                        padding: isMobile ? "8px 10px" : "10px 12px",
                        borderRadius: 8,
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                    >
                      {a.kind === "match" && a.time && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--text-muted)",
                            minWidth: isMobile ? 36 : 40,
                            paddingTop: 1,
                          }}
                        >
                          {a.time}
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: 10,
                              background: hexToRgba(teamColor, 0.15),
                              border: `1px solid ${hexToRgba(teamColor, 0.3)}`,
                              color: teamColor,
                            }}
                          >
                            {team?.name ?? "Equipo"}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: labelColor }}>{label}</span>
                        </div>
                        <div
                          style={{
                            fontSize: isMobile ? 13 : 14,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {a.title}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{a.meta}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0 4px", color: "var(--text-secondary)", fontSize: 13 }}>
                {isLoading ? "Cargando…" : "Sin actividades este día."}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
