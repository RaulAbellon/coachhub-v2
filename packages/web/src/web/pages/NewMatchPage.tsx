import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";

export default function NewMatchPage() {
  const [, navigate] = useLocation();
  const { token } = useAuth();

  // Preselecciona equipo y fecha desde ?teamId=X&date=YYYY-MM-DD
  const searchParams = new URLSearchParams(window.location.search);
  const preTeamId = searchParams.get("teamId");
  const preDate = searchParams.get("date");

  const [teamId, setTeamId] = useState<number | "">(preTeamId ? Number(preTeamId) : "");
  const [date, setDate] = useState(preDate || new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [opponent, setOpponent] = useState("");
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [venue, setVenue] = useState("");
  const [notes, setNotes] = useState("");
  const [teams, setTeams] = useState<{ id: number; name: string; role?: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Carga de equipos (una sola vez, en efecto: nunca durante el render)
  useEffect(() => {
    let cancelled = false;
    authFetch("/api/teams", {}, token)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list = (d.teams || []).filter((t: any) => t.role === "owner" || t.role === "editor");
        setTeams(list);
        if (!preTeamId && list.length === 1) setTeamId(list[0].id);
      })
      .catch(() => { if (!cancelled) setError("No se han podido cargar los equipos"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!teamId) { setError("Debes seleccionar un equipo"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({ teamId, date, time, meetingTime, opponent: opponent.trim(), homeAway, venue: venue.trim(), notes }),
      }, token);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      navigate(`/matches/${data.match.id}`);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "#1C2333", border: "1px solid #30363D", color: "#E6EDF3",
  };

  return (
    <div className="min-h-screen" style={{ background: "#0D1117", color: "#E6EDF3" }}>
      <div className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: "#30363D" }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm transition-opacity hover:opacity-70" style={{ color: "#8B8B9B" }}>
          <ArrowLeft size={18} /> Volver
        </button>
        <h1 className="text-lg font-semibold tracking-wide uppercase">Nuevo Partido</h1>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "#2D1B1B", color: "#F85149", border: "1px solid #5A1D1D" }}>{error}</div>
        )}

        {/* Equipo */}
        {teamsLoaded && teams.length === 0 ? (
          <div className="px-4 py-4 rounded-lg text-sm" style={{ background: "#2D1B1B", color: "#F0B8B8", border: "1px solid #5A1D1D" }}>
            No tienes equipos donde puedas crear partidos. <button onClick={() => navigate("/teams")} style={{ color: "#FF6B35", textDecoration: "underline", fontWeight: 600 }}>Ir a equipos</button>
          </div>
        ) : (
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "#8B8B9B" }}>Equipo *</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : "")} className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="">Selecciona un equipo</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Local / Visitante */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-3" style={{ color: "#8B8B9B" }}>Condición</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([["home", "Local", "#3FB950"], ["away", "Visitante", "#58A6FF"]] as const).map(([v, label, color]) => {
              const selected = homeAway === v;
              return (
                <button key={v} onClick={() => setHomeAway(v)} style={{
                  background: selected ? `${color}20` : "#1C2333",
                  border: `2px solid ${selected ? color : "#30363D"}`,
                  color: selected ? color : "#8B8B9B",
                  borderRadius: 10, padding: "12px 16px", fontSize: 13,
                  fontWeight: selected ? 700 : 500, cursor: "pointer", transition: "all 0.15s",
                }}>{label}</button>
              );
            })}
          </div>
        </div>

        {/* Rival */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "#8B8B9B" }}>Rival</label>
          <input type="text" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Ej: BM Valladolid B" className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>

        {/* Fecha */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "#8B8B9B" }}>Fecha *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={{ ...inputStyle, colorScheme: "dark" }} />
        </div>

        {/* Hora + Citación */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "#8B8B9B" }}>Hora del partido</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "#8B8B9B" }}>Hora de citación</label>
            <input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
        </div>

        {/* Pabellón / lugar */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "#8B8B9B" }}>Pabellón / lugar</label>
          <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ej: Polideportivo Huerta del Rey" className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "#8B8B9B" }}>Notas</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionales..." rows={3} className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none" style={inputStyle} />
        </div>

        <button onClick={handleSave} disabled={saving || !teamId} className="w-full py-4 rounded-lg font-semibold text-sm uppercase tracking-widest transition-opacity" style={{ background: "#FF6B35", color: "#0D1117", opacity: (saving || !teamId) ? 0.5 : 1 }}>
          {saving ? "Guardando..." : "Guardar Partido"}
        </button>
      </div>
    </div>
  );
}
