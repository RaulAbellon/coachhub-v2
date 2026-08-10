import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import Topbar from "../components/Topbar";
import { Icon, PATHS } from "../components/icons";
import { playerWord } from "../lib/gender";
import { authFetch } from "../lib/authFetch";
import { ADDITIONAL_COLOR, ADDITIONAL_DIM } from "../lib/additional";
import { AdditionalBadge } from "../components/AdditionalBadge";
import { formatFieldValue, type FormField } from "../lib/formFields";
import { generatePlayerPdf, type PlayerSummary } from "../lib/playerPdf";
import {
  categoryOf, computeTrend, trendColor, formatDateES, parseValue,
  type EvalValueEnriched,
} from "../lib/evaluations";

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
  isAdditional?: boolean;
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
  customValues?: Record<number, string>;
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
    isAdditional: false,
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
type PanelView = "ficha" | "lesiones" | "evaluaciones";

export default function PlayersPage({ params }: { params?: { teamId?: string } }) {
  const routeParams = useParams<{ teamId: string }>();
  const teamId = Number(params?.teamId || routeParams.teamId);
  const { token } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();

  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [panelView, setPanelView] = useState<PanelView>("ficha");
  const [showAddInjury, setShowAddInjury] = useState(false);
  const [editInjury, setEditInjury] = useState<Injury | null>(null);

  const [form, setForm] = useState(emptyPlayerForm());
  const [customForm, setCustomForm] = useState<Record<number, string>>({});
  const [injuryForm, setInjuryForm] = useState(emptyInjuryForm());
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pdfPlayer, setPdfPlayer] = useState<Player | null>(null);

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

  const { data: evalValuesData } = useQuery({
    queryKey: ["eval-values-player", selectedPlayer?.id],
    queryFn: async () =>
      (await authFetch(`/api/evaluations/values?playerId=${selectedPlayer!.id}`, {}, token)).json(),
    enabled: !!selectedPlayer,
  });
  const evalValues: EvalValueEnriched[] = evalValuesData?.values ?? [];

  // ─── Configuración de campos de la ficha (por equipo) ───────────────────────
  const formFields: FormField[] = playersData?.fields ?? [];
  const enabledFields = [...formFields]
    .filter(f => f.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const customFields = enabledFields.filter(f => !f.mapsToColumn);
  const fieldByKey = new Map(formFields.map(f => [f.key, f]));
  const isFieldOn = (key: string) => fieldByKey.get(key)?.enabled ?? true;
  const fieldLabel = (key: string, fallback: string) => fieldByKey.get(key)?.label ?? fallback;

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const createPlayer = useMutation({
    mutationFn: async (data: any) => (await authFetch("/api/players", { method: "POST", body: JSON.stringify(data) }, token)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["players", teamId] });
      setShowAddPlayer(false);
      setForm(emptyPlayerForm()); setCustomForm({}); setSaveError("");
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
      isAdditional: !!p.isAdditional,
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
    setCustomForm({ ...(p.customValues ?? {}) });
    setSaveError("");
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

  const savePlayerForm = async () => {
    const data = {
      teamId,
      name: form.name,
      number: form.number ? Number(form.number) : null,
      positions: JSON.stringify(form.positions),
      isAdditional: form.isAdditional,
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
    const values = { ...customForm };
    setSavingPlayer(true);
    setSaveError("");
    try {
      let playerId = editPlayer?.id ?? null;
      if (editPlayer) {
        const res = await updatePlayer.mutateAsync({ id: editPlayer.id, data });
        if (res?.error) throw new Error(res.error);
      } else {
        const res = await createPlayer.mutateAsync(data);
        if (res?.error) throw new Error(res.error);
        playerId = res?.player?.id ?? null;
      }

      // Campos personalizados (los nativos ya van en el PUT/POST de arriba)
      if (playerId && customFields.length > 0) {
        const payload: Record<number, string> = {};
        for (const f of customFields) payload[f.id] = values[f.id] ?? "";
        const res = await authFetch(
          `/api/players/${playerId}/custom-values`,
          { method: "PUT", body: JSON.stringify({ values: payload }) },
          token,
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const detail = json?.errors ? Object.values(json.errors).join(" · ") : json?.error;
          throw new Error(detail || "No se pudieron guardar los campos personalizados");
        }
      }

      qc.invalidateQueries({ queryKey: ["players", teamId] });
      setShowAddPlayer(false);
      setEditPlayer(null);
      setForm(emptyPlayerForm());
      setCustomForm({});
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingPlayer(false);
    }
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
  // Siempre la versión fresca del jugador seleccionado (incluye customValues).
  const selectedLive: Player | null = selectedPlayer
    ? players.find(p => p.id === selectedPlayer.id) ?? selectedPlayer
    : null;
  const injuries: Injury[] = injuriesData?.injuries ?? [];
  const team = teamData?.team;

  return (
    <>
      <Topbar
        crumbs={[{ label: "Equipos", href: "/teams" }, { label: team?.name || playerWord(team?.gender, true, true) }]}
        actions={
          <button
            className="btn-accent"
            onClick={() => { setEditPlayer(null); setForm(emptyPlayerForm()); setCustomForm({}); setSaveError(""); setShowAddPlayer(true); }}
          >
            <Icon d={PATHS.plus} size={14} color="#000" strokeWidth={2.2} /> {playerWord(team?.gender, false)}
          </button>
        }
      />
    <div className="page-body">
      <p className="section-label" style={{ marginBottom: 14 }}>
        {players.length} {playerWord(team?.gender, players.length !== 1)}
      </p>

      <div style={{ display: "flex", gap: 20, flexDirection: isMobile ? "column" : "row" }}>
        {/* ── Players list ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLoading ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cargando...</p>
          ) : players.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, opacity: 0.4 }}>
                <Icon d={PATHS.players} size={34} />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Sin {playerWord(team?.gender, true)}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>Añade {team?.gender === "masculino" ? "los" : "las"} {playerWord(team?.gender, true)} del equipo</p>
              <button className="btn-accent" onClick={() => setShowAddPlayer(true)}>+ Añadir {playerWord(team?.gender, false)}</button>
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
                      borderLeft: player.isAdditional ? `3px solid ${ADDITIONAL_COLOR}` : undefined,
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
                      ) : <Icon d={PATHS.players} size={18} color="var(--text-muted)" />}
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
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</span>
                        {player.isAdditional && <AdditionalBadge />}
                      </div>
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
        {selectedLive && (
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
                  {selectedLive.photoData ? (
                    <img src={selectedLive.photoData} alt={selectedLive.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : "👤"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedLive.name}</span>
                    {selectedLive.isAdditional && <AdditionalBadge />}
                  </div>
                  {selectedLive.number != null && (
                    <span style={{ fontSize: 12, color: "var(--accent)", marginRight: 8 }}>#{selectedLive.number}</span>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {parsePositions(selectedLive.positions).join(" · ") || "Sin posición"}
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
                {([["ficha", "Ficha"], ["lesiones", `Lesiones${activeInjuries > 0 ? ` (${activeInjuries})` : ""}`], ["evaluaciones", "Evaluaciones"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setPanelView(v)}
                    style={{
                      flex: 1, padding: "6px 0", fontSize: 11.5, fontWeight: 600,
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
                <FichaTab
                  player={selectedLive}
                  fields={enabledFields}
                  onEdit={() => openEdit(selectedLive)}
                  onDelete={() => deletePlayer.mutate(selectedLive.id)}
                  onExportPdf={() => setPdfPlayer(selectedLive)}
                />
              ) : panelView === "lesiones" ? (
                <LesionesTab
                  injuries={injuries}
                  onAdd={() => { setEditInjury(null); setInjuryForm(emptyInjuryForm()); setShowAddInjury(true); }}
                  onEdit={openEditInjury}
                  onResolve={(inj) => updateInjury.mutate({ id: inj.id, data: { resolved: !inj.resolved } })}
                  onDelete={(id) => deleteInjury.mutate(id)}
                  injuryDuration={injuryDuration}
                />
              ) : (
                <EvaluacionesTab
                  values={evalValues}
                  onOpenModule={() => navigate(`/teams/${teamId}/evaluations`)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add/Edit player modal ───────────────────────────────────────────── */}
      {showAddPlayer && (
        <Modal onClose={() => { setShowAddPlayer(false); setEditPlayer(null); setForm(emptyPlayerForm()); setCustomForm({}); setSaveError(""); }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{editPlayer ? `Editar ${playerWord(team?.gender, false)}` : `${team?.gender === "masculino" ? "Nuevo" : "Nueva"} ${playerWord(team?.gender, false)}`}</h2>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>{fieldLabel("nombre", "Nombre y apellidos")} *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" autoFocus />
            </div>

            {isFieldOn("dorsal") && (
              <div>
                <label style={labelStyle}>{fieldLabel("dorsal", "Dorsal")}</label>
                <input style={inputStyle} type="number" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="Nº" min={1} max={99} />
              </div>
            )}

            {isFieldOn("fecha_nac") && (
              <div>
                <label style={labelStyle}>{fieldLabel("fecha_nac", "Fecha de nacimiento")}</label>
                <input style={inputStyle} type="date" placeholder="DD/MM/AAAA" value={form.birthDate || ""} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
              </div>
            )}

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
          {isFieldOn("posicion") && (
            <>
              <label style={labelStyle}>{fieldLabel("posicion", "Posición")} (puedes elegir varias)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(fieldByKey.get("posicion")?.options?.length ? fieldByKey.get("posicion")!.options : POSITIONS).map(pos => (
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
            </>
          )}

          {/* Jugador adicional (sube de categoría inferior) */}
          <button
            onClick={() => setForm(f => ({ ...f, isAdditional: !f.isAdditional }))}
            style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 16,
              width: "100%", textAlign: "left", cursor: "pointer",
              padding: "12px 14px", borderRadius: 12,
              border: `1px solid ${form.isAdditional ? ADDITIONAL_COLOR : "var(--border)"}`,
              background: form.isAdditional ? ADDITIONAL_DIM : "var(--bg-secondary)",
              transition: "all 0.15s",
            }}>
            <span style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `2px solid ${form.isAdditional ? ADDITIONAL_COLOR : "var(--border)"}`,
              background: form.isAdditional ? ADDITIONAL_COLOR : "transparent",
              color: "#fff", fontSize: 13, fontWeight: 700,
            }}>{form.isAdditional ? "✓" : ""}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: form.isAdditional ? ADDITIONAL_COLOR : "var(--text-primary)" }}>
                Jugador adicional
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Sube de categoría inferior. No se marca como convocado ni asistente por defecto.
              </span>
            </span>
          </button>

          {/* Medidas */}
          {(isFieldOn("altura") || isFieldOn("peso") || isFieldOn("envergadura")) && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20, marginBottom: 0 }}>MEDIDAS</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: "0 12px" }}>
                {isFieldOn("altura") && (
                  <div>
                    <label style={labelStyle}>{fieldLabel("altura", "Altura (cm)")}</label>
                    <input style={inputStyle} type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} placeholder="175" />
                  </div>
                )}
                {isFieldOn("peso") && (
                  <div>
                    <label style={labelStyle}>{fieldLabel("peso", "Peso (kg)")}</label>
                    <input style={inputStyle} type="number" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="70" />
                  </div>
                )}
                {isFieldOn("envergadura") && (
                  <div>
                    <label style={labelStyle}>{fieldLabel("envergadura", "Envergadura (cm)")}</label>
                    <input style={inputStyle} type="number" value={form.wingspan} onChange={e => setForm(f => ({ ...f, wingspan: e.target.value }))} placeholder="180" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Salud */}
          {(isFieldOn("enfermedades") || isFieldOn("lesiones") || isFieldOn("alergias")) && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20, marginBottom: 0 }}>INFORMACIÓN MÉDICA</p>

              {isFieldOn("enfermedades") && (
                <>
                  <label style={labelStyle}>{fieldLabel("enfermedades", "Enfermedades crónicas")}</label>
                  <textarea style={{ ...inputStyle, resize: "vertical" }} value={form.chronicDiseases}
                    onChange={e => setForm(f => ({ ...f, chronicDiseases: e.target.value }))}
                    placeholder="Asma, diabetes, etc. (dejar vacío si ninguna)" rows={2} />
                </>
              )}

              {isFieldOn("lesiones") && (
                <>
                  <label style={labelStyle}>{fieldLabel("lesiones", "Lesiones previas")}</label>
                  <textarea style={{ ...inputStyle, resize: "vertical" }} value={form.previousInjuries}
                    onChange={e => setForm(f => ({ ...f, previousInjuries: e.target.value }))}
                    placeholder="Rotura LCA 2022, etc. (dejar vacío si ninguna)" rows={2} />
                </>
              )}

              {isFieldOn("alergias") && (
                <>
                  <label style={labelStyle}>{fieldLabel("alergias", "Alergias / Intolerancias")}</label>
                  <textarea style={{ ...inputStyle, resize: "vertical" }} value={form.allergies}
                    onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
                    placeholder="Penicilina, gluten, etc. (dejar vacío si ninguna)" rows={2} />
                </>
              )}
            </>
          )}

          {isFieldOn("notas") && (
            <>
              <label style={labelStyle}>{fieldLabel("notas", "Notas adicionales")}</label>
              <textarea style={{ ...inputStyle, resize: "vertical" }} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observaciones del entrenador..." rows={2} />
            </>
          )}

          {/* Campos personalizados del equipo */}
          {customFields.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20, marginBottom: 0 }}>
                OTROS DATOS DE LA FICHA
              </p>
              {customFields.map(f => (
                <CustomFieldInput
                  key={f.id}
                  field={f}
                  value={customForm[f.id] ?? ""}
                  onChange={v => setCustomForm(prev => ({ ...prev, [f.id]: v }))}
                />
              ))}
            </>
          )}

          {saveError && (
            <p style={{ fontSize: 12, color: "#ef4444", marginTop: 14 }}>{saveError}</p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={() => { setShowAddPlayer(false); setEditPlayer(null); setForm(emptyPlayerForm()); setCustomForm({}); setSaveError(""); }}>
              Cancelar
            </button>
            <button className="btn-primary"
              disabled={!form.name.trim() || savingPlayer}
              style={{ opacity: !form.name.trim() || savingPlayer ? 0.5 : 1 }}
              onClick={savePlayerForm}>
              {savingPlayer ? "Guardando..." : editPlayer ? "Guardar cambios" : `Añadir ${playerWord(team?.gender, false)}`}
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

      {/* ── Exportar ficha en PDF ────────────────────────────────────────────── */}
      {pdfPlayer && (
        <PdfExportModal
          player={pdfPlayer}
          teamColor={team?.color || "#22d3ee"}
          token={token}
          onClose={() => setPdfPlayer(null)}
        />
      )}
    </div>
    </>
  );
}

// ─── EXPORTAR FICHA EN PDF ────────────────────────────────────────────────────
function seasonStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-08-01`;
}

function PdfExportModal({ player, teamColor, token, onClose }: {
  player: Player;
  teamColor: string;
  token: string | null;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(seasonStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (from) { qs.set("attendanceFrom", from); qs.set("callupsFrom", from); }
      if (to) { qs.set("attendanceTo", to); qs.set("callupsTo", to); }
      const res = await authFetch(`/api/players/${player.id}/summary?${qs.toString()}`, {}, token);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo generar el resumen");
      generatePlayerPdf(json as PlayerSummary, { from, to }, teamColor);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar el PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Exportar ficha en PDF</h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>{player.name}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        El PDF incluye los datos de la ficha, la asistencia a entrenamientos y las convocatorias
        a partidos dentro del periodo elegido.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <div>
          <label style={labelStyle}>Desde</label>
          <input style={inputStyle} type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Hasta</label>
          <input style={inputStyle} type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      <button
        onClick={() => { setFrom(""); setTo(""); }}
        className="btn-ghost"
        style={{ marginTop: 12, fontSize: 11, padding: "4px 10px" }}>
        Todo el histórico
      </button>

      {error && <p style={{ fontSize: 12, color: "#ef4444", marginTop: 14 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={busy} style={{ opacity: busy ? 0.5 : 1 }} onClick={run}>
          {busy ? "Generando..." : "Descargar PDF"}
        </button>
      </div>
    </Modal>
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

const HEALTH_COLORS: Record<string, string> = {
  enfermedades: "#22d3ee",
  lesiones: "#f97316",
  alergias: "#ef4444",
};

// Claves ya representadas en la cabecera del panel del jugador.
const HEADER_KEYS = new Set(["nombre", "dorsal", "posicion"]);

function fieldValueOf(player: Player, f: FormField): string {
  const raw = f.mapsToColumn
    ? (player as unknown as Record<string, unknown>)[f.mapsToColumn]
    : player.customValues?.[f.id];
  return formatFieldValue({ type: f.type }, raw ?? "");
}

function FichaTab({ player, fields, onEdit, onDelete, onExportPdf }: {
  player: Player;
  fields: FormField[];
  onEdit: () => void;
  onDelete: () => void;
  onExportPdf: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const visible = fields.filter(f => !HEADER_KEYS.has(f.key));
  const birth = visible.find(f => f.key === "fecha_nac");
  const rest = visible.filter(f => f.key !== "fecha_nac");

  // Métricas numéricas → tarjetas compactas. Salud → cajas de color.
  // El resto (texto, párrafo, fecha, opciones, sí/no) → filas etiqueta + valor.
  const metrics = rest.filter(f => f.type === "number" && fieldValueOf(player, f));
  const health = rest.filter(f => HEALTH_COLORS[f.key]);
  const others = rest.filter(f => f.type !== "number" && !HEALTH_COLORS[f.key]);

  const unitFor = (key: string) => (key === "peso" ? " kg" : key === "altura" || key === "envergadura" ? " cm" : "");

  return (
    <div>
      {/* Fecha de nacimiento + edad */}
      {birth && player.birthDate && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "var(--bg-secondary)" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{birth.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{formatDate(player.birthDate)}</div>
          </div>
          <div style={{ width: 1, background: "var(--border)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Edad</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{calcAge(player.birthDate)}</div>
          </div>
        </div>
      )}

      {/* Métricas */}
      {metrics.length > 0 && (
        <>
          <p className="label-caps" style={{ marginBottom: 10 }}>Datos</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {metrics.map(f => (
              <div key={f.id} style={{
                flex: "1 1 88px", padding: "10px 8px", borderRadius: 8,
                background: "var(--bg-secondary)", textAlign: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                  {fieldValueOf(player, f)}{unitFor(f.key)}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {f.label.replace(/\s*\((cm|kg)\)\s*$/i, "")}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Otros campos (nativos + personalizados, en el orden configurado) */}
      {others.some(f => fieldValueOf(player, f)) && (
        <>
          <p className="label-caps" style={{ marginBottom: 10 }}>Ficha</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {others.map(f => {
              const value = fieldValueOf(player, f);
              if (!value) return null;
              return (
                <div key={f.id} style={{ padding: "8px 12px", borderRadius: 8, background: "var(--bg-secondary)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{value}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Salud */}
      {health.length > 0 && (
        <>
          <p className="label-caps" style={{ marginBottom: 10 }}>Información médica</p>
          {health.map(f => {
            const value = fieldValueOf(player, f);
            if (!value) return null;
            const color = HEALTH_COLORS[f.key];
            return (
              <div key={f.id} style={{
                padding: "8px 12px", borderRadius: 8, marginBottom: 6,
                background: `${color}11`, border: `1px solid ${color}33`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{f.label}</div>
                <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{value}</div>
              </div>
            );
          })}
          {!health.some(f => fieldValueOf(player, f)) && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Sin datos médicos registrados</p>
          )}
        </>
      )}

      <button className="btn-ghost" onClick={onExportPdf} style={{ width: "100%", marginTop: 18, fontSize: 12 }}>
        Exportar ficha en PDF
      </button>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn-ghost" onClick={onEdit} style={{ flex: 1, fontSize: 12 }}>Editar ficha</button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            style={{
              flex: 1, padding: "7px 0", fontSize: 12, borderRadius: 8,
              border: "1px solid #ef444433", background: "#ef444411",
              color: "#ef4444", cursor: "pointer",
            }}>Eliminar</button>
        ) : (
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            <button className="btn-ghost" onClick={() => setConfirmDelete(false)} style={{ flex: 1, fontSize: 11 }}>No</button>
            <button onClick={onDelete}
              style={{
                flex: 1, padding: "7px 0", fontSize: 11, borderRadius: 8,
                border: "none", background: "#ef4444", color: "#fff", cursor: "pointer",
              }}>Sí, eliminar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INPUT DE CAMPO PERSONALIZADO ─────────────────────────────────────────────
function CustomFieldInput({ field, value, onChange }: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "paragraph") {
    return (
      <>
        <label style={labelStyle}>{field.label}</label>
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={value}
          onChange={e => onChange(e.target.value)} />
      </>
    );
  }

  if (field.type === "boolean") {
    return (
      <>
        <label style={labelStyle}>{field.label}</label>
        <div style={{ display: "flex", gap: 6 }}>
          {([["true", "Sí"], ["false", "No"], ["", "—"]] as const).map(([v, label]) => (
            <button key={label} onClick={() => onChange(v)}
              style={{
                flex: 1, padding: "7px 0", fontSize: 12, borderRadius: 8, cursor: "pointer",
                border: `1px solid ${value === v ? "var(--accent)" : "var(--border)"}`,
                background: value === v ? "var(--accent-dim)" : "var(--bg-secondary)",
                color: value === v ? "var(--accent)" : "var(--text-secondary)",
              }}>{label}</button>
          ))}
        </div>
      </>
    );
  }

  if (field.type === "select") {
    return (
      <>
        <label style={labelStyle}>{field.label}</label>
        <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">— Sin valor —</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </>
    );
  }

  if (field.type === "multiselect") {
    let selected: string[] = [];
    try { const parsed = JSON.parse(value || "[]"); if (Array.isArray(parsed)) selected = parsed.map(String); }
    catch { selected = value ? value.split(",").map(v => v.trim()).filter(Boolean) : []; }
    const toggle = (o: string) => {
      const next = selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o];
      onChange(next.length > 0 ? JSON.stringify(next) : "");
    };
    return (
      <>
        <label style={labelStyle}>{field.label}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {field.options.map(o => (
            <button key={o} onClick={() => toggle(o)}
              style={{
                padding: "5px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer",
                border: `1px solid ${selected.includes(o) ? "var(--accent)" : "var(--border)"}`,
                background: selected.includes(o) ? "var(--accent-dim)" : "var(--bg-secondary)",
                color: selected.includes(o) ? "var(--accent)" : "var(--text-secondary)",
              }}>{o}</button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <label style={labelStyle}>{field.label}</label>
      <input
        style={inputStyle}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </>
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
              <p style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Activas</p>
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
  const color = inj.resolved ? "var(--text-muted)" : "#ef4444";

  return (
    <div style={{
      padding: "10px 12px", borderRadius: 8, marginBottom: 8,
      background: "var(--bg-secondary)",
      border: `1px solid ${inj.resolved ? "var(--border)" : "#ef444433"}`,
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
              style={{ fontSize: 10, padding: "3px 8px", background: "none", border: "1px solid #ef444433", borderRadius: 6, cursor: "pointer", color: "#ef4444" }}>
              Borrar
            </button>
          ) : (
            <div style={{ display: "flex", gap: 3 }}>
              <button onClick={() => setShowDel(false)} style={{ fontSize: 10, padding: "3px 6px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-muted)" }}>No</button>
              <button onClick={() => onDelete(inj.id)} style={{ fontSize: 10, padding: "3px 6px", background: "#ef4444", border: "none", borderRadius: 6, cursor: "pointer", color: "#fff" }}>Sí</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EVALUACIONES TAB ─────────────────────────────────────────────────────────
function EvaluacionesTab({ values, onOpenModule }: {
  values: EvalValueEnriched[];
  onOpenModule: () => void;
}) {
  const [openTestId, setOpenTestId] = useState<number | null>(null);

  // Agrupar por prueba, cada grupo ordenado de más antiguo a más reciente.
  const groups = (() => {
    const map = new Map<number, { test: NonNullable<EvalValueEnriched["test"]>; rows: EvalValueEnriched[] }>();
    for (const v of values) {
      if (!v.test || !v.session) continue;
      const g = map.get(v.test.id) ?? { test: v.test, rows: [] };
      g.rows.push(v);
      map.set(v.test.id, g);
    }
    const list = [...map.values()];
    for (const g of list) {
      g.rows.sort((a, b) => (a.session?.date ?? "").localeCompare(b.session?.date ?? ""));
    }
    list.sort((a, b) => (a.test.sortOrder - b.test.sortOrder) || a.test.name.localeCompare(b.test.name));
    return list;
  })();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span className="label-caps">Valoraciones físicas</span>
        <button className="btn-ghost" onClick={onOpenModule} style={{ padding: "3px 10px", fontSize: 11 }}>
          Ir al módulo
        </button>
      </div>

      {groups.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <p style={{ fontSize: 22, marginBottom: 8 }}>📊</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Sin valoraciones registradas</p>
        </div>
      ) : (
        groups.map((g) => {
          const cat = categoryOf(g.test.category);
          const last = g.rows[g.rows.length - 1];
          const prev = g.rows.length > 1 ? g.rows[g.rows.length - 2] : null;
          const trend = computeTrend(last?.value, prev?.value, g.test.lowerIsBetter);
          const open = openTestId === g.test.id;
          const nums = g.rows.map((r) => parseValue(r.value)).filter((n): n is number => n !== null);
          const min = nums.length ? Math.min(...nums) : 0;
          const max = nums.length ? Math.max(...nums) : 0;
          const span = max - min || 1;

          return (
            <div key={g.test.id} style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 8,
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
            }}>
              <button
                onClick={() => setOpenTestId(open ? null : g.test.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8, width: "100%", background: "none", border: "none",
                  padding: 0, cursor: "pointer", textAlign: "left", color: "inherit",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>
                    {g.test.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                      color: cat.color, background: `${cat.color}1a`, border: `1px solid ${cat.color}44`,
                      borderRadius: 5, padding: "1px 6px",
                    }}>{cat.label}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {g.rows.length} {g.rows.length === 1 ? "registro" : "registros"}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                    {last?.value}
                    <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 3 }}>{g.test.unit}</span>
                  </div>
                  {trend && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: trendColor(trend) }}>
                      {trend.arrow} {trend.label}
                    </div>
                  )}
                </div>
              </button>

              {open && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  {nums.length > 1 && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 44, marginBottom: 10 }}>
                      {g.rows.map((r) => {
                        const n = parseValue(r.value);
                        const h = n === null ? 2 : 8 + ((n - min) / span) * 32;
                        return (
                          <div key={r.id} title={`${r.session?.date ?? ""}: ${r.value}`}
                            style={{ flex: 1, height: h, background: cat.color, opacity: 0.75, borderRadius: 3 }} />
                        );
                      })}
                    </div>
                  )}
                  {[...g.rows].reverse().map((r) => (
                    <div key={r.id} style={{
                      display: "flex", justifyContent: "space-between", gap: 8,
                      fontSize: 11.5, padding: "4px 0", borderBottom: "1px solid var(--border)",
                    }}>
                      <span style={{ color: "var(--text-muted)" }}>{formatDateES(r.session?.date ?? "")}</span>
                      <strong style={{ color: "var(--text-primary)" }}>{r.value} {g.test.unit}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
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

function Modal({ children }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
      <div className="card fade-in" style={{ padding: 28, maxWidth: 540, width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}
