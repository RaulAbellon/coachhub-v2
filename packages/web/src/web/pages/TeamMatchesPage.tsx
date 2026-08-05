import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { MapPin, Clock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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

function MatchRow({ m, onClick }: { m: Match; onClick: () => void }) {
  const homeColor = m.homeAway === "home" ? "#3FB950" : "#58A6FF";
  const played = m.goalsFor != null && m.goalsAgainst != null;
  const win = played && m.goalsFor! > m.goalsAgainst!;
  const draw = played && m.goalsFor === m.goalsAgainst;
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 18px", cursor: "pointer",
        borderBottom: "1px solid var(--border)",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
    >
      <div style={{ width: 3, height: 40, borderRadius: 3, background: homeColor, flexShrink: 0, opacity: 0.8 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
          {m.opponent || "Rival por definir"}
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: `${homeColor}22`, color: homeColor }}>
            {m.homeAway === "home" ? "Local" : "Visitante"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
          <span>{new Date(m.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</span>
          {m.time && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={11} /> {m.time}h</span>}
          {m.venue && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} /> {m.venue}</span>}
        </div>
      </div>
      {played ? (
        <span style={{
          fontSize: 14, fontWeight: 800, padding: "4px 12px", borderRadius: 10, flexShrink: 0,
          background: draw ? "rgba(139,139,155,0.18)" : win ? "rgba(63,185,80,0.16)" : "rgba(255,69,58,0.16)",
          color: draw ? "#8B8B9B" : win ? "#3FB950" : "#FF453A",
        }}>{m.goalsFor} - {m.goalsAgainst}</span>
      ) : (
        <span style={{ color: "var(--text-muted)", fontSize: 16 }}>›</span>
      )}
    </div>
  );
}

export default function TeamMatchesPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = Number(params.teamId);
  const [, navigate] = useLocation();
  const { user, token } = useAuth();

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await authFetch("/api/teams", {}, token);
      return res.json();
    },
    enabled: !!user,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["matches", teamId],
    queryFn: async () => {
      const res = await authFetch(`/api/matches?teamId=${teamId}`, {}, token);
      return res.json() as Promise<{ matches: Match[] }>;
    },
    enabled: !!user && !!teamId,
  });

  const teams = teamsData?.teams ?? [];
  const team = teams.find((t: any) => t.id === teamId);
  const teamColor = team?.color || "#FF6B35";
  const canEdit = team?.role === "owner" || team?.role === "editor";

  const allMatches = data?.matches ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allMatches.filter(m => m.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = allMatches.filter(m => m.date < today).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="fade-in" style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <button
          onClick={() => navigate("/teams")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 22, lineHeight: 1, padding: 0 }}
        >←</button>
        <div>
          {team ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: teamColor, boxShadow: `0 0 8px ${teamColor}66`, flexShrink: 0 }} />
                <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{team.name}</h1>
                {team.category && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: hexToRgba(teamColor, 0.12), border: `1px solid ${hexToRgba(teamColor, 0.3)}`, color: teamColor, fontWeight: 600 }}>{team.category}</span>
                )}
              </div>
              <p className="label-caps" style={{ marginTop: 5 }}>
                {allMatches.length} partido{allMatches.length !== 1 ? "s" : ""} en total
              </p>
            </>
          ) : (
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>Partidos del equipo</h1>
          )}
        </div>
        {canEdit && (
          <button className="btn-primary" style={{ marginLeft: "auto", fontSize: 13 }} onClick={() => navigate(`/matches/new?teamId=${teamId}`)}>
            + Nuevo partido
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 14, textAlign: "center", marginTop: 60 }}>Cargando...</div>
      ) : allMatches.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ marginBottom: 14, opacity: 0.4, display: "flex", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20"/></svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Sin partidos todavía</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 }}>
            {canEdit ? "Crea el primer partido para este equipo" : "Este equipo aún no tiene partidos"}
          </p>
          {canEdit && (
            <button className="btn-primary" onClick={() => navigate(`/matches/new?teamId=${teamId}`)}>+ Nuevo partido</button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {upcoming.length > 0 && (
            <div>
              <p className="label-caps" style={{ marginBottom: 10 }}>Próximos ({upcoming.length})</p>
              <div className="card" style={{ overflow: "hidden" }}>
                {upcoming.map(m => <MatchRow key={m.id} m={m} onClick={() => navigate(`/matches/${m.id}`)} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="label-caps" style={{ marginBottom: 10 }}>Jugados ({past.length})</p>
              <div className="card" style={{ overflow: "hidden" }}>
                {past.map(m => <MatchRow key={m.id} m={m} onClick={() => navigate(`/matches/${m.id}`)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
