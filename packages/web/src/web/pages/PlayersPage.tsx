import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { playerWord } from "../lib/gender";
import { authFetch } from "../lib/authFetch";

const POSITIONS = [
  "Portera",
  "Extremo derecho",
  "Extremo izquierdo",
  "Central",
  "Lateral derecho",
  "Lateral izquierdo",
  "Pivote",
];

type Player = {
  id: number;
  teamId: number;
  name: string;
  number: number | null;
  positions: string; // JSON array string
  photoData: string | null;
  height: number | null;
  weight: number | null;
  wingspan: number | null;
  birthDate: string | null;
  chronicDiseases: string | null;
  previousInjuries: string | null;
  allergies: string | null;
  notes: string | null;
  createdAt: any;
};

type Injury = {
  id: number;
  playerId: number;
  type: string;
  zone: string;
  description: string;
  dateStart: string;
  dateEnd: string;
  sawDoctor: boolean;
  sawPhysio: boolean;
  medicalNotes: string;
  resolved: boolean;
  createdAt: any;
  updatedAt: any;
};

function parsePositions(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return raw ? [raw] : []; }
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "var(--text-secondary)", marginBottom: 6, marginTop: 16,
  textTransform: "uppercase", letterSpacing: "0.06em",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 14,
  background: "var(--bg-secondary)", border: "1px solid var(--border)",
  borderRadius: 8, color: "var(--text-primary)", boxSizing: "border-box",
};

// ─── Empty form defaults ───────────────────────────────────────────────────────
function emptyPlayerForm() {
  return {
    name: "", number: "", positions: [] as string[],
    birthDate: "",
    height: "", weight: "", wingspan: "",
    chronicDiseases: "", previousInjuries: "", allergies: "",
    notes: "", photoData: "",
  };
}

function emptyInjuryForm() {
  return {
    type: "lesion", zone: "", description: "",
    dateStart: new Date().toISOString().slice(0, 10),
    dateEnd: "", sawDoctor: false, sawPhysio: false, medicalNotes: "",
    // ui-only: only description, medicalNotes, dateStart shown
  };
}

// ─── PANEL VIEWS ──────────────────────────────────────────────────────────────
type PanelView = "ficha" | "lesiones";

export default function PlayersPage({ params }: { params?: { teamId?: string } }) {
  const routeParams = useParams<{ teamId: string }>();
  const teamId = Number(params?.teamId || routeParams.teamId);
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [panelView, setPanelView] = useState<PanelView>("ficha");
  const [showAddInjury, setShowAddInjury] = useState(false);
  const [editInjury, setEditInjury] = useState<Injury | null>(null);

  const [form, setForm] = useState(emptyPlayerForm());
  const [injuryForm, setInjuryForm] = useState(emptyInjuryForm());

  const { data: teamData } = useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => (await authFetch(`/api/teams/${teamId}`, {}, token)).json(),
    enabled: !!teamId,
  });

  const { data: playersData, isLoading } = useQuery({
    queryKey: ["players", teamId],
    queryFn: async () => (await authFetch(`/api/players?teamId=${teamId}`, {}, token)).json(),
    enabled: !!teamId,
  });

  const { data: injuriesData } = useQuery({
    queryKey: ["injuries", selectedPlayer?.id],
    queryFn: async () => (await authFetch(`/api/injuries?playerId=${selectedPlayer!.id}`, {}, token)).json(),
    enabled: !!selectedPlayer,
  });

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const createPlayer = useMutation({
    mutationFn: async (data: any) => (await authFetch("/api/players", { method: "POST", body: JSON.stringify(data) }, token)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["players", teamId] });
      setShowAddPlayer(false);
      setForm(emptyPlayerForm());
    },
  });

  const updatePlayer = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      (await authFetch(`/api/players/${id}`, { method: "PUT", body: JSON.stringify(data) }, token)).json(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["players", teamId] });
      setEditPlayer(null);
      if (res.player) setSelectedPlayer(res.player);
    },
  });

  const deletePlayer = useMutation({
    mutationFn: async (id: number) => authFetch(`/api/players/${id}`, { method: "DELETE" }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["players", teamId] });
      setSelectedPlayer(null);
    },
  });

  const createInjury = useMutation({
    mutationFn: async (data: any) => (await authFetch("/api/injuries", { method: "POST", body: JSON.stringify(data) }, token)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["injuries", selectedPlayer?.id] });
      setShowAddInjury(false);
      setInjuryForm(emptyInjuryForm());
    },
  });

  const updateInjury = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      (await authFetch(`/api/injuries/${id}`, { method: "PUT", body: JSON.stringify(data) }, token)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["injuries", selectedPlayer?.id] });
      setEditInjury(null);
    },
  });

  const deleteInjury = useMutation({
    mutationFn: async (id: number) => authFetch(`/api/injuries/${id}`, { method: "DELETE" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["injuries", selectedPlayer?.id] }),
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, photoData: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const togglePosition = (pos: string) => {
    setForm(f => ({
      ...f,
      positions: f.positions.includes(pos)
        ? f.positions.filter(p => p !== pos)
        : [...f.positions, pos],
    }));
  };

  const openEdit = (p: Player) => {
    setEditPlayer(p);
    setForm({
      name: p.name,
      number: String(p.number ?? ""),
      positions: parsePositions(p.positions),
      birthDate: p.birthDate ?? "",
      height: String(p.height ?? ""),
      weight: String(p.weight ?? ""),
      wingspan: String(p.wingspan ?? ""),
      chronicDiseases: p.chronicDiseases ?? "",
      previousInjuries: p.previousInjuries ?? "",
      allergies: p.allergies ?? "",
      notes: p.notes ?? "",
      photoData: p.photoData ?? "",
    });
    setShowAddPlayer(true);
  };

  const openEditInjury = (inj: Injury) => {
    setEditInjury(inj);
    setInjuryForm({
      type: inj.type,
      zone: inj.zone ?? "",
      description: inj.description,
      dateStart: inj.dateStart,
      dateEnd: inj.dateEnd ?? "",
      sawDoctor: inj.sawDoctor ?? false,
      sawPhysio: inj.sawPhysio ?? false,
      medicalNotes: inj.medicalNotes ?? "",
    });
    setShowAddInjury(true);
  };

  const savePlayerForm = () => {
    const data = {
      teamId,
      name: form.name,
      number: form.number ? Number(form.number) : null,
      positions: JSON.stringify(form.positions),
      height: form.height ? Number(form.height) : null,
      weight: form.weight ? Number(form.weight) : null,
      wingspan: form.wingspan ? Number(form.wingspan) : null,
      birthDate: form.birthDate || null,
      chronicDiseases: form.chronicDiseases,
      previousInjuries: form.previousInjuries,
      allergies: form.allergies,
      notes: form.notes,
      photoData: form.photoData,
    };
    if (editPlayer) updatePlayer.mutate({ id: editPlayer.id, data });
    else createPlayer.mutate(data);
  };

  const saveInjuryForm = () => {
    if (!selectedPlayer) return;
    const data = { playerId: selectedPlayer.id, ...injuryForm };
    if (editInjury) updateInjury.mutate({ id: editInjury.id, data });
    else createInjury.mutate(data);
  };

  const injuryDuration = (inj: Injury) => {
    if (!inj.dateEnd) return "En curso";
    const start = new Date(inj.dateStart);
    const end = new Date(inj.dateEnd);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000);
    return `${days} día${days !== 1 ? "s" : ""}`;
  };

  const activeInjuries = (injuriesData?.injuries ?? []).filter((i: Injury) => !i.resolved).length;

  const players: Player[] = playersData?.players ?? [];
  const injuries: Injury[] = injuriesData?.injuries ?? [];
  const team = teamData?.team;

  return (
    <div className="fade-in" style={{ padding: isMobile ? "16px" : "32px 40px", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isMobile ? 18 : 28, flexWrap: "wrap" }}>
        <button className="btn-ghost" onClick={() => navigate("/teams")} style={{ padding: "6px 10px", fontSize: 13, flexShrink: 0 }}>← Volver</button>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <h1 style={{ fontSize: isMobile ? 19 : 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {team?.name || playerWord(team?.gender, true, true)}
          </h1>
          <p className="label-caps" style={{ marginTop: 4 }}>{players.length} {playerWord(team?.gender, players.length !== 1)}</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditPlayer(null); setForm(emptyPlayerForm()); setShowAddPlayer(true); }}
          style={isMobile ? { flex: "1 1 100%", justifyContent: "center", order: 3 } : {}}>
          + Añadir {playerWord(team?.gender, false)}
        </button>
      </div>

      <div style={{ display: "flex", gap: 20, flexDirection: isMobile ? "column" : "row" }}>
        {/* ── Players list ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLoading ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cargando...</p>
          ) : players.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <p style={{ fontSize: 28, marginBottom: 12 }}>👥</p>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Sin {playerWord(team?.gender, true)}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>Añade {team?.gender === "masculino" ? "los" : "las"} {playerWord(team?.gender, true)} del equipo</p>
              <button className="btn-primary" onClick={() => setShowAddPlayer(true)}>+ Añadir {playerWord(team?.gender, false)}</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {players.sort((a, b) => (a.number ?? 99) - (b.number ?? 99)).map(player => {
                const pos = parsePositions(player.positions);
                return (
                  <div
                    key={player.id}
                    className="card card-hover"
                    onClick={() => {
                      setSelectedPlayer(selectedPlayer?.id === player.id ? null : player);
                      setPanelView("ficha");
                    }}
                    style={{
                      padding: isMobile ? "10px 12px" : "12px 16px", display: "flex", alignItems: "center", gap: isMobile ? 10 : 12,
                      cursor: "pointer", minWidth: 0,
                      border: selectedPlayer?.id === player.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                      transition: "border-color 0.15s",
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: isMobile ? 36 : 40, height: isMobile ? 36 : 40, borderRadius: 10, overflow: "hidden",
                      background: "var(--bg-secondary)", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}>
                      {player.photoData ? (
                        <img src={player.photoData} alt={player.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : "👤"}
                    </div>

                    {/* Dorsal */}
                    {player.number != null && (
                      <div style={{
                        width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, borderRadius: 6, background: "var(--accent-dim)",
                        color: "var(--accent)", fontWeight: 700, fontSize: isMobile ? 12 : 13,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        {player.number}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
                      {pos.length > 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {pos.join(" · ")}
                        </div>
                      )}
                    </div>

                    {/* Stats chips — hidden on mobile to save space */}
                    {!isMobile && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {player.height && <Chip>{player.height}cm</Chip>}
                        {player.weight && <Chip>{player.weight}kg</Chip>}
                      </div>
                    )}

                    {!isMobile && (
                      <button className="btn-ghost" onClick={e => { e.stopPropagation(); openEdit(player); }}
                        style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }}>Editar</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        {selectedPlayer && isMobile && (
          <div
            onClick={() => setSelectedPlayer(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, backdropFilter: "blur(2px)" }}
          />
        )}
        {selectedPlayer && (
          <div className="card fade-in" style={isMobile ? {
            position: "fixed", left: 0, right: 0, bottom: 0,
            width: "100%", padding: 0, maxHeight: "80vh", overflowY: "auto",
            borderRadius: "18px 18px 0 0", zIndex: 201, boxSizing: "border-box",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
          } : { width: 320, padding: 0, height: "fit-content", position: "sticky", top: 20, overflow: "hidden" }}>
            {isMobile && (
              <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
              </div>
            )}
            {/* Player header */}
            <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 12, overflow: "hidden",
                  background: "var(--bg-secondary)", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}>
                  {selectedPlayer.photoData ? (
                    <img src={selectedPlayer.photoData} alt={selectedPlayer.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : "👤"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedPlayer.name}</div>
                  {selectedPlayer.number != null && (
                    <span style={{ fontSize: 12, color: "var(--accent)", marginRight: 8 }}>#{selectedPlayer.number}</span>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {parsePositions(selectedPlayer.positions).join(" · ") || "Sin posición"}
                  </div>
                </div>
                {isMobile && (
                  <button
                    onClick={() => setSelectedPlayer(null)}
                    style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "50%",
                      width: 28, height: 28, cursor: "pointer", color: "var(--text-primary)",
                      fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >×</button>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
                {([["ficha", "Ficha"], ["lesiones", `Lesiones${activeInjuries > 0 ? ` (${activeInjuries})` : ""}`]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setPanelView(v)}
                    style={{
                      flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600,
                      border: "none", borderRadius: 8, cursor: "pointer",
                      background: panelView === v ? "var(--accent)" : "var(--bg-secondary)",
                      color: panelView === v ? "#000" : "var(--text-secondary)",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div style={{ padding: "16px 20px 20px" }}>
              {panelView === "ficha" ? (
                <FichaTab player={selectedPlayer} onEdit={() => openEdit(selectedPlayer)} onDelete={() => deletePlayer.mutate(selectedPlayer.id)} />
              ) : (
                <LesionesTab
                  injuries={injuries}
                  onAdd={() => { setEditInjury(null); setInjuryForm(emptyInjuryForm()); setShowAddInjury(true); }}
                  onEdit={openEditInjury}
                  onResolve={(inj) => updateInjury.mutate({ id: inj.id, data: { resolved: !inj.resolved } })}
                  onDelete={(id) => deleteInjury.mutate(id)}
                  injuryDuration={injuryDuration}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add/Edit player modal ───────────────────────────────────────────── */}
      {showAddPlayer && (
        <Modal onClose={() => { setShowAddPlayer(false); setEditPlayer(null); setForm(emptyPlayerForm()); }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{editPlayer ? `Editar ${playerWord(team?.gender, false)}` : `${team?.gender === "masculino" ? "Nuevo" : "Nueva"} ${playerWord(team?.gender, false)}`}</h2>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Nombre y apellidos *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" autoFocus />
            </div>

            <div>
              <label style={labelStyle}>Dorsal</label>
              <input style={inputStyle} type="number" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="Nº" min={1} max={99} />
            </div>

            <div>
              <label style={labelStyle}>Fecha de nacimiento</label>
              <input style={inputStyle} type="date" placeholder="DD/MM/AAAA" value={form.birthDate || ""} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
            </div>

            <div>
              <label style={labelStyle}>Foto (opcional)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {form.photoData && (
                  <img src={form.photoData} alt="preview" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                )}
                <label style={{
                  padding: "6px 12px", fontSize: 12, borderRadius: 8,
                  background: "var(--bg-secondary)", border: "1px solid var(--border)",
                  cursor: "pointer", color: "var(--text-secondary)", whiteSpace: "nowrap",
                }}>
                  {form.photoData ? "Cambiar" : "Subir foto"}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
                </label>
              </div>
            </div>
          </div>

          {/* Posiciones (multi-select) */}
          <label style={labelStyle}>Posición (puedes elegir varias)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {POSITIONS.map(pos => (
              <button key={pos} onClick={() => togglePosition(pos)}
                style={{
                  padding: "5px 12px", fontSize: 12, borderRadius: 20,
                  border: `1px solid ${form.positions.includes(pos) ? "var(--accent)" : "var(--border)"}`,
                  background: form.positions.includes(pos) ? "var(--accent-dim)" : "var(--bg-secondary)",
                  color: form.positions.includes(pos) ? "var(--accent)" : "var(--text-secondary)",
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                {pos}
              </button>
            ))}
          </div>

          {/* Medidas */}
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20, marginBottom: 0 }}>MEDIDAS</p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: "0 12px" }}>
            <div>
              <label style={labelStyle}>Altura (cm)</label>
              <input style={inputStyle} type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} placeholder="175" />
            </div>
            <div>
              <label style={labelStyle}>Peso (kg)</label>
              <input style={inputStyle} type="number" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="70" />
            </div>
            <div>
              <label style={labelStyle}>Envergadura (cm)</label>
              <input style={inputStyle} type="number" value={form.wingspan} onChange={e => setForm(f => ({ ...f, wingspan: e.target.value }))} placeholder="180" />
            </div>
          </div>

          {/* Salud */}
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20, marginBottom: 0 }}>INFORMACIÓN MÉDICA</p>

          <label style={labelStyle}>Enfermedades crónicas</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} value={form.chronicDiseases}
            onChange={e => setForm(f => ({ ...f, chronicDiseases: e.target.value }))}
            placeholder="Asma, diabetes, etc. (dejar vacío si ninguna)" rows={2} />

          <label style={labelStyle}>Lesiones previas relevantes</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} value={form.previousInjuries}
            onChange={e => setForm(f => ({ ...f, previousInjuries: e.target.value }))}
            placeholder="Rotura LCA 2022, etc. (dejar vacío si ninguna)" rows={2} />

          <label style={labelStyle}>Alergias / Intolerancias</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} value={form.allergies}
            onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
            placeholder="Penicilina, gluten, etc. (dejar vacío si ninguna)" rows={2} />

          <label style={labelStyle}>Notas adicionales</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Observaciones del entrenador..." rows={2} />

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={() => { setShowAddPlayer(false); setEditPlayer(null); setForm(emptyPlayerForm()); }}>
              Cancelar
            </button>
            <button className="btn-primary"
              disabled={!form.name.trim()}
              style={{ opacity: !form.name.trim() ? 0.5 : 1 }}
              onClick={savePlayerForm}>
              {editPlayer ? "Guardar cambios" : `Añadir ${playerWord(team?.gender, false)}`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add/Edit injury modal ───────────────────────────────────────────── */}
      {showAddInjury && selectedPlayer && (
        <Modal onClose={() => { setShowAddInjury(false); setEditInjury(null); setInjuryForm(emptyInjuryForm()); }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{editInjury ? "Editar lesión" : "Nueva lesión"}</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>{selectedPlayer.name}</p>

          <label style={labelStyle}>Fecha inicio *</label>
          <input style={inputStyle} type="date" value={injuryForm.dateStart} onChange={e => setInjuryForm(f => ({ ...f, dateStart: e.target.value }))} />

          <label style={labelStyle}>Descripción</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} value={injuryForm.description}
            onChange={e => setInjuryForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe la lesión o incidencia..." rows={3} />

          <label style={labelStyle}>Comentario (opcional)</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} value={injuryForm.medicalNotes}
            onChange={e => setInjuryForm(f => ({ ...f, medicalNotes: e.target.value }))}
            placeholder="Seguimiento, observaciones..." rows={2} />

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={() => { setShowAddInjury(false); setEditInjury(null); setInjuryForm(emptyInjuryForm()); }}>
              Cancelar
            </button>
            <button className="btn-primary"
              disabled={!injuryForm.dateStart}
              style={{ opacity: !injuryForm.dateStart ? 0.5 : 1 }}
              onClick={saveInjuryForm}>
              {editInjury ? "Guardar cambios" : "Registrar lesión"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── FICHA TAB ────────────────────────────────────────────────────────────────
function calcAge(birthDate: string | null): string {
  if (!birthDate) return "—";
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return `${age} años`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function FichaTab({ player, onEdit, onDelete }: { player: Player; onEdit: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows: [string, string][] = [
    ["Altura", player.height ? `${player.height} cm` : "—"],
    ["Peso", player.weight ? `${player.weight} kg` : "—"],
    ["Envergadura", player.wingspan ? `${player.wingspan} cm` : "—"],
  ];

  const healthRows: [string, string, string][] = [
    ["Enfermedades crónicas", player.chronicDiseases ?? "", "#FF6B35"],
    ["Lesiones previas", player.previousInjuries ?? "", "#FF9500"],
    ["Alergias / Intolerancias", player.allergies ?? "", "#FF3B30"],
  ];

  return (
    <div>
      {/* Datos personales */}
      {player.birthDate && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "var(--bg-secondary)" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Fecha de nacimiento</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{formatDate(player.birthDate)}</div>
          </div>
          <div style={{ width: 1, background: "var(--border)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Edad</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{calcAge(player.birthDate)}</div>
          </div>
        </div>
      )}

      {/* Medidas */}
      <p className="label-caps" style={{ marginBottom: 10 }}>Medidas</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{
            flex: 1, padding: "10px 8px", borderRadius: 8,
            background: "var(--bg-secondary)", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{v}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{k}</div>
          </div>
        ))}
      </div>

      {/* Salud */}
      <p className="label-caps" style={{ marginBottom: 10 }}>Información médica</p>
      {healthRows.map(([label, value, color]) => (
        value ? (
          <div key={label} style={{
            padding: "8px 12px", borderRadius: 8, marginBottom: 6,
            background: `${color}11`, border: `1px solid ${color}33`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{value}</div>
          </div>
        ) : null
      ))}
      {!player.chronicDiseases && !player.previousInjuries && !player.allergies && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Sin datos médicos registrados</p>
      )}

      {player.notes && (
        <>
          <p className="label-caps" style={{ marginTop: 14, marginBottom: 6 }}>Notas</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{player.notes}</p>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button className="btn-ghost" onClick={onEdit} style={{ flex: 1, fontSize: 12 }}>Editar ficha</button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            style={{
              flex: 1, padding: "7px 0", fontSize: 12, borderRadius: 8,
              border: "1px solid #FF3B3033", background: "#FF3B3011",
              color: "#FF3B30", cursor: "pointer",
            }}>Eliminar</button>
        ) : (
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            <button className="btn-ghost" onClick={() => setConfirmDelete(false)} style={{ flex: 1, fontSize: 11 }}>No</button>
            <button onClick={onDelete}
              style={{
                flex: 1, padding: "7px 0", fontSize: 11, borderRadius: 8,
                border: "none", background: "#FF3B30", color: "#fff", cursor: "pointer",
              }}>Sí, eliminar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LESIONES TAB ─────────────────────────────────────────────────────────────
function LesionesTab({
  injuries, onAdd, onEdit, onResolve, onDelete, injuryDuration,
}: {
  injuries: Injury[];
  onAdd: () => void;
  onEdit: (i: Injury) => void;
  onResolve: (i: Injury) => void;
  onDelete: (id: number) => void;
  injuryDuration: (i: Injury) => string;
}) {
  const active = injuries.filter(i => !i.resolved);
  const resolved = injuries.filter(i => i.resolved);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span className="label-caps">Historial de lesiones</span>
        <button className="btn-ghost" onClick={onAdd} style={{ padding: "3px 10px", fontSize: 11 }}>+ Nueva</button>
      </div>

      {injuries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <p style={{ fontSize: 22, marginBottom: 8 }}>🏃</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Sin lesiones registradas</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#FF3B30", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Activas</p>
              {active.map(inj => <InjuryCard key={inj.id} inj={inj} onEdit={onEdit} onResolve={onResolve} onDelete={onDelete} duration={injuryDuration(inj)} />)}
            </>
          )}
          {resolved.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 14, marginBottom: 8 }}>Resueltas</p>
              {resolved.map(inj => <InjuryCard key={inj.id} inj={inj} onEdit={onEdit} onResolve={onResolve} onDelete={onDelete} duration={injuryDuration(inj)} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function InjuryCard({ inj, onEdit, onResolve, onDelete, duration }: {
  inj: Injury; onEdit: (i: Injury) => void; onResolve: (i: Injury) => void;
  onDelete: (id: number) => void; duration: string;
}) {
  const [showDel, setShowDel] = useState(false);
  const color = inj.resolved ? "var(--text-muted)" : "#FF3B30";

  return (
    <div style={{
      padding: "10px 12px", borderRadius: 8, marginBottom: 8,
      background: "var(--bg-secondary)",
      border: `1px solid ${inj.resolved ? "var(--border)" : "#FF3B3033"}`,
      opacity: inj.resolved ? 0.65 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1 }}>
          {inj.zone && (
            <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
              {inj.zone}
            </div>
          )}
          {inj.description && (
            <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 4 }}>{inj.description}</div>
          )}
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {inj.dateStart}{inj.dateEnd ? ` → ${inj.dateEnd}` : " → en curso"} · <strong>{duration}</strong>
          </div>
          {(inj.sawDoctor || inj.sawPhysio) && (
            <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
              {inj.sawDoctor && <SmallBadge>🩺 Médico</SmallBadge>}
              {inj.sawPhysio && <SmallBadge>💆 Fisio</SmallBadge>}
            </div>
          )}
          {inj.medicalNotes && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 5, fontStyle: "italic", lineHeight: 1.4 }}>
              {inj.medicalNotes}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          <button onClick={() => onEdit(inj)}
            style={{ fontSize: 10, padding: "3px 8px", background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-secondary)" }}>
            Editar
          </button>
          <button onClick={() => onResolve(inj)}
            style={{ fontSize: 10, padding: "3px 8px", background: "none", border: `1px solid ${inj.resolved ? "var(--border)" : "#34C75933"}`, borderRadius: 6, cursor: "pointer", color: inj.resolved ? "var(--text-muted)" : "#34C759" }}>
            {inj.resolved ? "Reabrir" : "Alta"}
          </button>
          {!showDel ? (
            <button onClick={() => setShowDel(true)}
              style={{ fontSize: 10, padding: "3px 8px", background: "none", border: "1px solid #FF3B3033", borderRadius: 6, cursor: "pointer", color: "#FF3B30" }}>
              Borrar
            </button>
          ) : (
            <div style={{ display: "flex", gap: 3 }}>
              <button onClick={() => setShowDel(false)} style={{ fontSize: 10, padding: "3px 6px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-muted)" }}>No</button>
              <button onClick={() => onDelete(inj.id)} style={{ fontSize: 10, padding: "3px 6px", background: "#FF3B30", border: "none", borderRadius: 6, cursor: "pointer", color: "#fff" }}>Sí</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── UTILITY COMPONENTS ───────────────────────────────────────────────────────
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: "2px 8px", fontSize: 11, borderRadius: 6,
      background: "var(--bg-secondary)", color: "var(--text-muted)",
      border: "1px solid var(--border)",
    }}>{children}</span>
  );
}

function SmallBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: "2px 7px", fontSize: 10, borderRadius: 5,
      background: "var(--bg-primary)", color: "var(--text-secondary)",
      border: "1px solid var(--border)",
    }}>{children}</span>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
      <div className="card fade-in" style={{ padding: 28, maxWidth: 540, width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}
