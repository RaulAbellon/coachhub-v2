import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import { useIsMobile } from "../hooks/useIsMobile";

const DAYS_DESKTOP = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAYS_MOBILE  = ["L",   "M",   "X",   "J",   "V",   "S",   "D"];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const SESSION_TYPE_META: Record<string, { label: string; color: string }> = {
  ataque:      { label: "Ataque",      color: "#FF6B35" },
  defensa:     { label: "Defensa",     color: "#58A6FF" },
  transicion:  { label: "Transición",  color: "#3FB950" },
  preparacion: { label: "Preparación", color: "#BC8CFF" },
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function formatDateES(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long",
  });
}

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
  role?: string;
}
interface Match {
  id: number;
  teamId: number;
  date: string;
  time: string;
  meetingTime: string;
  opponent: string;
  homeAway: string;
  venue: string;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export default function CalendarPage() {
  const today = new Date();
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { user, token } = useAuth();

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const { data } = useQuery({
    queryKey: ["sessions-all", monthStr],
    queryFn: async () => {
      const res = await authFetch(`/api/sessions/all-teams?month=${monthStr}`, {}, token);
      return res.json() as Promise<{ sessions: Session[]; teams: Team[] }>;
    },
    enabled: !!user,
  });

  const { data: matchesData } = useQuery({
    queryKey: ["matches-all", monthStr],
    queryFn: async () => {
      const res = await authFetch(`/api/matches/all-teams?month=${monthStr}`, {}, token);
      return res.json() as Promise<{ matches: Match[] }>;
    },
    enabled: !!user,
  });

  const sessions: Session[] = data?.sessions ?? [];
  const teams: Team[]       = data?.teams    ?? [];
  const matches: Match[]    = matchesData?.matches ?? [];
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));
  // Can create sessions if user is owner or editor in at least one team
  const canEdit = teams.some(t => t.role === "owner" || t.role === "editor");

  const sessionMap: Record<string, Session[]> = {};
  sessions.forEach(s => {
    if (!sessionMap[s.date]) sessionMap[s.date] = [];
    sessionMap[s.date].push(s);
  });

  const matchMap: Record<string, Match[]> = {};
  matches.forEach(m => {
    if (!matchMap[m.date]) matchMap[m.date] = [];
    matchMap[m.date].push(m);
  });

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDayOfMonth(year, month);
  const todayStr    = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const prevMonth = () => { setSelectedDay(null); setCurrentDate(new Date(year, month - 1, 1)); };
  const nextMonth = () => { setSelectedDay(null); setCurrentDate(new Date(year, month + 1, 1)); };

  const handleDayClick = (dateStr: string) => {
    setSelectedDay(prev => prev === dateStr ? null : dateStr);
  };

  const selectedSessions = selectedDay ? (sessionMap[selectedDay] ?? []) : [];
  const selectedMatches  = selectedDay ? (matchMap[selectedDay] ?? []) : [];
  const DAYS = isMobile ? DAYS_MOBILE : DAYS_DESKTOP;

  /* ─── Match card (used in sheet + desktop panel) ─── */
  const MatchCard = ({ m, compact }: { m: Match; compact?: boolean }) => {
    const team = teamMap[m.teamId];
    const teamColor = team?.color || "#FF6B35";
    const homeColor = m.homeAway === "home" ? "#3FB950" : "#58A6FF";
    const played = m.goalsFor != null && m.goalsAgainst != null;
    const win = played && m.goalsFor! > m.goalsAgainst!;
    const draw = played && m.goalsFor === m.goalsAgainst;
    return (
      <div
        onClick={() => navigate(`/matches/${m.id}`)}
        style={{
          padding: compact ? "11px 13px" : "13px 15px",
          borderRadius: compact ? 8 : 12,
          background: "var(--bg-secondary)",
          border: `1px solid ${hexToRgba(homeColor, 0.3)}`,
          borderLeft: `3px solid ${homeColor}`,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: "rgba(245,166,35,0.18)", border: "1px solid rgba(245,166,35,0.4)", color: "var(--accent)" }}>PARTIDO</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: hexToRgba(teamColor, 0.2), border: `1px solid ${hexToRgba(teamColor, 0.4)}`, color: teamColor }}>{team?.name ?? "Equipo"}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 12, background: `${homeColor}20`, color: homeColor }}>{m.homeAway === "home" ? "Local" : "Visitante"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600, color: "var(--text-primary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.opponent || "Rival por definir"}
          </div>
          {played && (
            <span style={{ fontSize: 13, fontWeight: 800, padding: "2px 9px", borderRadius: 8, flexShrink: 0, background: draw ? "rgba(139,139,155,0.18)" : win ? "rgba(63,185,80,0.16)" : "rgba(255,69,58,0.16)", color: draw ? "#8B8B9B" : win ? "#3FB950" : "#FF453A" }}>{m.goalsFor}-{m.goalsAgainst}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-secondary)", marginTop: 5, flexWrap: "wrap" }}>
          {m.time && <span>🕐 {m.time}h</span>}
          {m.venue && <span>📍 {m.venue}</span>}
        </div>
      </div>
    );
  };

  /* ─── Mobile bottom sheet ─── */
  const DaySheet = () => {
    if (!selectedDay || !isMobile) return null;
    return (
      <>
        {/* Scrim */}
        <div
          onClick={() => setSelectedDay(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            zIndex: 200, backdropFilter: "blur(2px)",
          }}
        />
        {/* Sheet */}
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          background: "var(--bg-card)",
          borderRadius: "18px 18px 0 0",
          padding: "0 0 32px",
          zIndex: 201,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
          maxHeight: "70vh",
          overflowY: "auto",
        }}>
          {/* Handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
          </div>
          {/* Sheet header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 16px" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", textTransform: "capitalize" }}>
              {formatDateES(selectedDay)}
            </p>
            <button
              onClick={() => setSelectedDay(null)}
              style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "50%",
                width: 28, height: 28, cursor: "pointer", color: "var(--text-primary)",
                fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
            >×</button>
          </div>

          <div style={{ padding: "0 16px" }}>
            {selectedMatches.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: selectedSessions.length > 0 ? 12 : 0 }}>
                {selectedMatches.map(m => <MatchCard key={m.id} m={m} />)}
              </div>
            )}
            {selectedSessions.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedSessions.map(s => {
                  const team      = teamMap[s.teamId];
                  const teamColor = team?.color || "#FF6B35";
                  const typeMeta  = SESSION_TYPE_META[s.sessionType] ?? SESSION_TYPE_META.ataque;
                  return (
                    <div
                      key={s.id}
                      onClick={() => navigate(`/sessions/${s.id}`)}
                      style={{
                        padding: "13px 15px",
                        borderRadius: 12,
                        background: "var(--bg-secondary)",
                        border: `1px solid ${hexToRgba(teamColor, 0.3)}`,
                        cursor: "pointer",
                        borderLeft: `3px solid ${teamColor}`,
                      }}
                    >
                      <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                          background: hexToRgba(teamColor, 0.2),
                          border: `1px solid ${hexToRgba(teamColor, 0.4)}`,
                          color: teamColor,
                        }}>{team?.name ?? "Equipo"}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 12,
                          background: hexToRgba(typeMeta.color, 0.12),
                          color: typeMeta.color,
                        }}>{typeMeta.label}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{s.title}</div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-secondary)" }}>
                        <span>{s.duration} min</span>
                        <span style={{ color: "var(--accent)" }}>MC {s.microcycle}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : selectedMatches.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
                <div style={{ marginBottom: 10, opacity: 0.35 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg></div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.5 }}>
                  Nada programado este día.
                </p>
              </div>
            ) : null}

            {canEdit && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                <button
                  className="btn-ghost"
                  style={{ width: "100%", fontSize: 13, padding: "9px 0" }}
                  onClick={() => navigate(`/sessions/new?date=${selectedDay}`)}
                >+ Añadir sesión</button>
                <button
                  className="btn-ghost"
                  style={{ width: "100%", fontSize: 13, padding: "9px 0" }}
                  onClick={() => navigate(`/matches/new?date=${selectedDay}`)}
                >+ Añadir partido</button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  /* ─── Render ─── */
  return (
    <div
      className="fade-in page-container"
      style={{
        padding: isMobile ? "16px 0 80px" : "24px 32px",
        maxWidth: isMobile ? "100%" : 1100,
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* ── HEADER ── */}
      {isMobile ? (
        /* Mobile header: title + month nav in one compact row */
        <div style={{ padding: "0 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", margin: 0 }}>
            Calendario
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={prevMonth} style={navBtnStyleMobile}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", minWidth: 110, textAlign: "center" }}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} style={navBtnStyleMobile}>›</button>
          </div>
        </div>
      ) : (
        /* Desktop header */
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Calendario</h1>
            <p className="label-caps" style={{ marginTop: 6 }}>Todos los equipos</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={prevMonth} style={navBtnStyle}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 700, minWidth: 160, textAlign: "center", color: "var(--text-primary)" }}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} style={navBtnStyle}>›</button>
            <div style={{ width: 1, height: 28, background: "var(--border)", margin: "0 4px" }} />
            {canEdit && (
              <button className="btn-primary" onClick={() => navigate("/sessions/new")}>
                + Nueva sesión
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── TEAM LEGEND (desktop only) ── */}
      {!isMobile && teams.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {teams.map(t => (
            <span key={t.id} style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              background: hexToRgba(t.color || "#FF6B35", 0.15),
              border: `1px solid ${hexToRgba(t.color || "#FF6B35", 0.4)}`,
              color: t.color || "#FF6B35",
            }}>{t.name}</span>
          ))}
        </div>
      )}

      {/* ── MOBILE TEAM LEGEND (horizontal scroll) ── */}
      {isMobile && teams.length > 0 && (
        <div style={{ overflowX: "auto", display: "flex", gap: 8, padding: "0 16px 12px", scrollbarWidth: "none" }}>
          {teams.map(t => (
            <span key={t.id} style={{
              flexShrink: 0,
              fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: hexToRgba(t.color || "#FF6B35", 0.15),
              border: `1px solid ${hexToRgba(t.color || "#FF6B35", 0.4)}`,
              color: t.color || "#FF6B35",
            }}>{t.name}</span>
          ))}
        </div>
      )}

      {/* ── MAIN LAYOUT ── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", padding: isMobile ? "0 8px" : 0 }}>

        {/* ── CALENDAR GRID ── */}
        <div
          className="card"
          style={{
            overflow: "hidden",
            flex: 1,
            borderRadius: isMobile ? 14 : 12,
          }}
        >
          {/* Day headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
            borderBottom: "1px solid var(--border)",
            background: "rgba(255,255,255,0.02)",
          }}>
            {DAYS.map(d => (
              <div key={d} style={{
                padding: isMobile ? "10px 0" : "11px 0",
                textAlign: "center",
                fontSize: isMobile ? 11 : 11,
                fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: isMobile ? "0.05em" : "0.1em",
              }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{
                  minHeight: isMobile ? 64 : 88,
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                }}
              />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day      = i + 1;
              const dateStr  = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const daySessions = sessionMap[dateStr] ?? [];
              const dayMatches  = matchMap[dateStr] ?? [];
              const isToday  = dateStr === todayStr;
              const isSelected = dateStr === selectedDay;
              const col      = (firstDay + i) % 7;
              const isWeekend = col >= 5;
              const baseBg = isSelected ? "rgba(245,166,35,0.08)" : isWeekend ? "rgba(88,166,255,0.045)" : "transparent";

              return (
                <div
                  key={day}
                  onClick={() => handleDayClick(dateStr)}
                  style={{
                    minHeight: isMobile ? 64 : 88,
                    padding: isMobile ? "8px 4px 6px" : "10px 8px 8px",
                    borderRight: col < 6 ? "1px solid var(--border)" : "none",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    background: baseBg,
                    transition: "background 0.15s",
                    outline: isSelected ? "1.5px solid var(--accent)" : "none",
                    outlineOffset: -1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                  onMouseEnter={e => {
                    if (!isSelected)
                      (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={e => {
                    if (!isSelected)
                      (e.currentTarget as HTMLDivElement).style.background = baseBg;
                  }}
                >
                  {/* Day number */}
                  <div style={{
                    width: isMobile ? 28 : 26,
                    height: isMobile ? 28 : 26,
                    borderRadius: "50%",
                    background: isToday ? "var(--accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: isMobile ? 13 : 13,
                    fontWeight: isToday ? 800 : 400,
                    color: isToday ? "#0D1117" : isSelected ? "var(--accent)" : "var(--text-primary)",
                    marginBottom: isMobile ? 5 : 4,
                    flexShrink: 0,
                  }}>{day}</div>

                  {/* Session + match indicators */}
                  {isMobile ? (
                    /* MOBILE: colored dots (matches = square, sessions = circle) */
                    (daySessions.length > 0 || dayMatches.length > 0) && (
                      <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap", maxWidth: "100%", paddingBottom: 2 }}>
                        {dayMatches.slice(0, 2).map((m, idx) => (
                          <div key={`m${idx}`} style={{
                            width: 6, height: 6, borderRadius: 1.5,
                            background: "var(--accent)",
                            flexShrink: 0,
                          }} />
                        ))}
                        {daySessions.slice(0, 3).map((s, idx) => {
                          const teamColor = teamMap[s.teamId]?.color || "#FF6B35";
                          return (
                            <div key={idx} style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: teamColor,
                              flexShrink: 0,
                            }} />
                          );
                        })}
                        {daySessions.length > 3 && (
                          <div style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: "rgba(255,255,255,0.25)",
                          }} />
                        )}
                      </div>
                    )
                  ) : (
                    /* DESKTOP: text pills */
                    <>
                      {dayMatches.slice(0, 2).map((m, idx) => (
                        <div key={`m${idx}`} style={{
                          background: "rgba(245,166,35,0.18)",
                          border: "1px solid rgba(245,166,35,0.45)",
                          borderRadius: 4,
                          padding: "2px 5px",
                          fontSize: 10,
                          color: "var(--accent)",
                          fontWeight: 700,
                          marginBottom: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}>
                          <span style={{ fontSize: 8 }}>🏐</span>
                          {m.opponent || "Partido"}
                        </div>
                      ))}
                      {(() => {
                        const remaining = 2 - Math.min(dayMatches.length, 2);
                        return daySessions.slice(0, remaining).map((s, idx) => {
                        const team      = teamMap[s.teamId];
                        const teamColor = team?.color || "#FF6B35";
                        return (
                          <div key={idx} style={{
                            background: hexToRgba(teamColor, 0.15),
                            border: `1px solid ${hexToRgba(teamColor, 0.35)}`,
                            borderRadius: 4,
                            padding: "2px 5px",
                            fontSize: 10,
                            color: teamColor,
                            fontWeight: 600,
                            marginBottom: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            width: "100%",
                          }}>
                            {team?.name ?? s.title}
                          </div>
                        );
                      });
                      })()}
                      {(() => {
                        const shown = Math.min(dayMatches.length, 2) + Math.max(0, Math.min(daySessions.length, 2 - Math.min(dayMatches.length, 2)));
                        const total = dayMatches.length + daySessions.length;
                        return total > shown ? (
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", paddingLeft: 5 }}>
                            +{total - shown} más
                          </div>
                        ) : null;
                      })()}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── DESKTOP day detail panel ── */}
        {!isMobile && selectedDay && (
          <div className="day-panel" style={{ width: 280, flexShrink: 0 }}>
            <div className="card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3, textTransform: "capitalize" }}>
                    {formatDateES(selectedDay)}
                  </p>
                  {selectedSessions.length === 0 && selectedMatches.length === 0 && (
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>Nada programado</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 18, lineHeight: 1, padding: "0 0 0 8px", marginTop: -2 }}
                >×</button>
              </div>

              {selectedMatches.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: selectedSessions.length > 0 ? 10 : 0 }}>
                  {selectedMatches.map(m => <MatchCard key={m.id} m={m} compact />)}
                </div>
              )}

              {selectedSessions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selectedSessions.map(s => {
                    const team      = teamMap[s.teamId];
                    const teamColor = team?.color || "#FF6B35";
                    const typeMeta  = SESSION_TYPE_META[s.sessionType] ?? SESSION_TYPE_META.ataque;
                    return (
                      <div
                        key={s.id}
                        onClick={() => navigate(`/sessions/${s.id}`)}
                        style={{
                          padding: "11px 13px", borderRadius: 8,
                          background: "var(--bg-secondary)",
                          border: `1px solid ${hexToRgba(teamColor, 0.3)}`,
                          cursor: "pointer", transition: "background 0.15s",
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-secondary)"}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                            background: hexToRgba(teamColor, 0.2),
                            border: `1px solid ${hexToRgba(teamColor, 0.4)}`,
                            color: teamColor,
                          }}>{team?.name ?? "Equipo"}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 12,
                            background: hexToRgba(typeMeta.color, 0.12),
                            color: typeMeta.color,
                          }}>{typeMeta.label}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{s.title}</div>
                        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-secondary)" }}>
                          <span>{s.duration} min</span>
                          <span style={{ color: "var(--accent)" }}>MC {s.microcycle}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : selectedMatches.length === 0 ? (
                <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
                  <div style={{ marginBottom: 8, opacity: 0.4, display: "flex", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="15" x2="12" y2="15"/></svg></div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
                    Nada programado este día.
                  </p>
                </div>
              ) : null}

              {canEdit && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  <button
                    className="btn-ghost"
                    style={{ width: "100%", fontSize: 12, padding: "7px 0" }}
                    onClick={() => navigate(`/sessions/new?date=${selectedDay}`)}
                  >+ Añadir sesión</button>
                  <button
                    className="btn-ghost"
                    style={{ width: "100%", fontSize: 12, padding: "7px 0" }}
                    onClick={() => navigate(`/matches/new?date=${selectedDay}`)}
                  >+ Añadir partido</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE bottom sheet ── */}
      <DaySheet />

      {/* ── MATCHES LIST THIS MONTH ── */}
      {matches.length > 0 && (
        <div style={{ marginTop: isMobile ? 24 : 32, padding: isMobile ? "0 8px" : 0 }}>
          <p className="label-caps" style={{ marginBottom: 14, paddingLeft: isMobile ? 4 : 0 }}>
            Partidos este mes · {matches.length}
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
            gap: isMobile ? 8 : 10,
          }}>
            {matches.map(m => {
              const team = teamMap[m.teamId];
              const teamColor = team?.color || "#FF6B35";
              const homeColor = m.homeAway === "home" ? "#3FB950" : "#58A6FF";
              const played = m.goalsFor != null && m.goalsAgainst != null;
              const win = played && m.goalsFor! > m.goalsAgainst!;
              const draw = played && m.goalsFor === m.goalsAgainst;
              return (
                <div
                  key={m.id}
                  className="card card-hover"
                  onClick={() => navigate(`/matches/${m.id}`)}
                  style={{
                    padding: isMobile ? "14px 16px" : "15px 18px",
                    cursor: "pointer",
                    borderLeft: `3px solid ${homeColor}`,
                    borderRadius: isMobile ? 12 : 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: "rgba(245,166,35,0.18)", border: "1px solid rgba(245,166,35,0.4)", color: "var(--accent)" }}>PARTIDO</span>
                    {team && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: hexToRgba(teamColor, 0.15), border: `1px solid ${hexToRgba(teamColor, 0.35)}`, color: teamColor }}>{team.name}</span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 12, background: `${homeColor}20`, color: homeColor }}>{m.homeAway === "home" ? "Local" : "Visitante"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 5 }}>
                    {new Date(m.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.opponent || "Rival por definir"}</div>
                    {played && (
                      <span style={{ fontSize: 14, fontWeight: 800, padding: "2px 9px", borderRadius: 8, flexShrink: 0, background: draw ? "rgba(139,139,155,0.18)" : win ? "rgba(63,185,80,0.16)" : "rgba(255,69,58,0.16)", color: draw ? "#8B8B9B" : win ? "#3FB950" : "#FF453A" }}>{m.goalsFor}-{m.goalsAgainst}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                    {m.time && <span>{m.time}h</span>}
                    {m.venue && <span>· {m.venue}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SESSIONS LIST THIS MONTH ── */}
      {sessions.length > 0 && (
        <div style={{ marginTop: isMobile ? 24 : 32, padding: isMobile ? "0 8px" : 0 }}>
          <p className="label-caps" style={{ marginBottom: 14, paddingLeft: isMobile ? 4 : 0 }}>
            Este mes · {sessions.length} sesión{sessions.length !== 1 ? "es" : ""}
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
            gap: isMobile ? 8 : 10,
          }}>
            {sessions.map(s => {
              const team      = teamMap[s.teamId];
              const teamColor = team?.color || "#FF6B35";
              const typeMeta  = SESSION_TYPE_META[s.sessionType] ?? SESSION_TYPE_META.ataque;
              return (
                <div
                  key={s.id}
                  className="card card-hover"
                  onClick={() => navigate(`/sessions/${s.id}`)}
                  style={{
                    padding: isMobile ? "14px 16px" : "15px 18px",
                    cursor: "pointer",
                    borderLeft: `3px solid ${teamColor}`,
                    borderRadius: isMobile ? 12 : 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    {team && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                        background: hexToRgba(teamColor, 0.15),
                        border: `1px solid ${hexToRgba(teamColor, 0.35)}`,
                        color: teamColor,
                      }}>{team.name}</span>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 12,
                      background: hexToRgba(typeMeta.color, 0.12),
                      color: typeMeta.color,
                    }}>{typeMeta.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 5 }}>
                    {new Date(s.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>{s.title}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                    <span>{s.duration} min</span>
                    <span style={{ color: "var(--accent)" }}>· MC {s.microcycle}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {sessions.length === 0 && matches.length === 0 && !selectedDay && (
        <div style={{ marginTop: 60, textAlign: "center", color: "var(--text-secondary)" }}>
          <div style={{ marginBottom: 14, display: "flex", justifyContent: "center", opacity: 0.4 }}><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg></div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Sin sesiones este mes</div>
          <div style={{ fontSize: 13, marginTop: 6, marginBottom: 24 }}>
            {canEdit ? "Crea tu primera sesión para empezar" : "Aún no hay sesiones este mes"}
          </div>
          {canEdit && (
            <button className="btn-primary" onClick={() => navigate("/sessions/new")}>+ Nueva sesión</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Styles ── */
const navBtnStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  borderRadius: 8,
  width: 34, height: 34,
  cursor: "pointer",
  fontSize: 18,
  display: "flex", alignItems: "center", justifyContent: "center",
  lineHeight: 1,
};

const navBtnStyleMobile: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  borderRadius: 8,
  width: 32, height: 32,
  cursor: "pointer",
  fontSize: 18,
  display: "flex", alignItems: "center", justifyContent: "center",
  lineHeight: 1,
  flexShrink: 0,
};
