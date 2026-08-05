import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";

const SESSION_TYPES = [
  { key: "ataque",      label: "Ataque",               color: "#FF6B35" },
  { key: "defensa",     label: "Defensa",               color: "#58A6FF" },
  { key: "transicion",  label: "Transición",            color: "#3FB950" },
  { key: "preparacion", label: "Preparación de partido", color: "#BC8CFF" },
];

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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

export default function TeamSessionsPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = Number(params.teamId);
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    ataque: true, defensa: false, transicion: false, preparacion: false,
  });

  // Fetch team info
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await authFetch("/api/teams", {}, token);
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch all sessions for this team (no month filter)
  const { data, isLoading } = useQuery({
    queryKey: ["sessions", teamId],
    queryFn: async () => {
      const res = await authFetch(`/api/sessions?teamId=${teamId}`, {}, token);
      return res.json() as Promise<{ sessions: Session[] }>;
    },
    enabled: !!user && !!teamId,
  });

  const sessions: Session[] = (data?.sessions ?? []).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const teams = teamsData?.teams ?? [];
  const team = teams.find((t: any) => t.id === teamId);
  const teamColor = team?.color || "#FF6B35";
  const canEdit = team?.role === "owner" || team?.role === "editor";

  const toggleFolder = (key: string) =>
    setOpenFolders(prev => ({ ...prev, [key]: !prev[key] }));

  const sessionsByType: Record<string, Session[]> = {
    ataque: [], defensa: [], transicion: [], preparacion: [],
  };
  sessions.forEach(s => {
    const key = s.sessionType ?? "ataque";
    if (sessionsByType[key]) sessionsByType[key].push(s);
    else sessionsByType["ataque"].push(s);
  });

  return (
    <div className="fade-in" style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
      {/* Back + header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <button
          onClick={() => navigate("/teams")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 22, lineHeight: 1, padding: 0 }}
        >←</button>
        <div>
          {team ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: teamColor,
                  boxShadow: `0 0 8px ${teamColor}66`,
                  flexShrink: 0,
                }} />
                <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  {team.name}
                </h1>
                {team.category && (
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 12,
                    background: hexToRgba(teamColor, 0.12),
                    border: `1px solid ${hexToRgba(teamColor, 0.3)}`,
                    color: teamColor, fontWeight: 600,
                  }}>{team.category}</span>
                )}
              </div>
              <p className="label-caps" style={{ marginTop: 5 }}>
                {sessions.length} sesión{sessions.length !== 1 ? "es" : ""} en total
              </p>
            </>
          ) : (
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>Sesiones del equipo</h1>
          )}
        </div>
        {canEdit && (
          <button
            className="btn-primary"
            style={{ marginLeft: "auto", fontSize: 13 }}
            onClick={() => navigate(`/sessions/new?teamId=${teamId}`)}
          >
            + Nueva sesión
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 14, textAlign: "center", marginTop: 60 }}>Cargando...</div>
      ) : sessions.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ marginBottom: 14, opacity: 0.4, display: "flex", justifyContent: "center" }}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg></div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Sin sesiones todavía</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 }}>
            {canEdit ? "Crea la primera sesión para este equipo" : "Este equipo aún no tiene sesiones"}
          </p>
          {canEdit && (
            <button className="btn-primary" onClick={() => navigate(`/sessions/new?teamId=${teamId}`)}>+ Nueva sesión</button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SESSION_TYPES.map(type => {
            const typeSessions = sessionsByType[type.key] ?? [];
            const isOpen = !!openFolders[type.key];

            return (
              <div key={type.key} className="card" style={{ overflow: "hidden" }}>
                {/* Folder header */}
                <div
                  onClick={() => toggleFolder(type.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 18px", cursor: "pointer",
                    background: isOpen ? hexToRgba(type.color, 0.05) : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = hexToRgba(type.color, 0.07)}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = isOpen ? hexToRgba(type.color, 0.05) : "transparent"}
                >
                  {/* Folder icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: hexToRgba(type.color, 0.12),
                    border: `1px solid ${hexToRgba(type.color, 0.25)}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: type.color }} />
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                      {type.label}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                      {typeSessions.length} sesión{typeSessions.length !== 1 ? "es" : ""}
                    </div>
                  </div>

                  {/* Count badge */}
                  {typeSessions.length > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 12,
                      background: hexToRgba(type.color, 0.15),
                      color: type.color,
                    }}>{typeSessions.length}</span>
                  )}

                  {/* Chevron */}
                  <span style={{
                    fontSize: 14, color: "var(--text-muted)",
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                    display: "inline-block",
                    marginLeft: 4,
                  }}>›</span>
                </div>

                {/* Sessions list */}
                {isOpen && typeSessions.length > 0 && (
                  <div style={{ borderTop: `1px solid ${hexToRgba(type.color, 0.15)}` }}>
                    {typeSessions.map((s, idx) => (
                      <div
                        key={s.id}
                        onClick={() => navigate(`/sessions/${s.id}`)}
                        style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "13px 18px 13px 22px",
                          cursor: "pointer",
                          borderBottom: idx < typeSessions.length - 1 ? "1px solid var(--border)" : "none",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                      >
                        {/* Left color accent */}
                        <div style={{
                          width: 3, height: 36, borderRadius: 3,
                          background: type.color, flexShrink: 0, opacity: 0.7,
                        }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>
                            {s.title}
                          </div>
                          <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
                            <span>
                              {new Date(s.date + "T12:00:00").toLocaleDateString("es-ES", {
                                weekday: "short", day: "numeric", month: "short", year: "numeric",
                              })}
                            </span>
                            <span>·</span>
                            <span>{s.duration} min</span>
                          </div>
                        </div>

                        {/* Microcycle badge */}
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
                          background: "var(--bg-secondary)",
                          color: "var(--accent)",
                          border: "1px solid var(--border)",
                          flexShrink: 0,
                        }}>MC {s.microcycle}</span>

                        <span style={{ color: "var(--text-muted)", fontSize: 16 }}>›</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty folder open state */}
                {isOpen && typeSessions.length === 0 && (
                  <div style={{
                    borderTop: `1px solid ${hexToRgba(type.color, 0.1)}`,
                    padding: "18px 22px",
                    fontSize: 13, color: "var(--text-muted)",
                    textAlign: "center",
                  }}>
                    Sin sesiones de este tipo todavía
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
