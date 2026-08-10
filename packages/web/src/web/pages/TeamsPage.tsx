import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { playerWord } from "../lib/gender";
import { authFetch } from "../lib/authFetch";
import { PlayerFormSetup } from "../components/PlayerFormSetup";
import Topbar from "../components/Topbar";
import { Icon, PATHS } from "../components/icons";
import { useIsMobile } from "../hooks/useIsMobile";

const PRESET_COLORS = [
  "#22d3ee", "#a855f7", "#fbbf24", "#f97316",
  "#22c55e", "#14b8a6", "#3b82f6", "#6366f1",
  "#ec4899", "#ef4444", "#fafafa", "#a1a1aa",
];

const DEFAULT_TEAM_COLOR = "#22d3ee";

const CATEGORIES = [
  "Senior", "Juvenil", "Cadete", "Infantil",
  "Alevín", "Benjamín", "Prebenjamín", "Otro"
];



function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function TeamBadge({ team, size = 44 }: { team: any; size?: number }) {
  if (team.logoData) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 12, overflow: "hidden",
        border: `2px solid ${team.color}44`, flexShrink: 0,
        background: "var(--bg-secondary)",
      }}>
        <img src={team.logoData} alt={team.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 12,
      background: `${team.color}22`, border: `2px solid ${team.color}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, color: team.color,
    }}>
      <UsersIcon />
    </div>
  );
}

export default function TeamsPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState(DEFAULT_TEAM_COLOR);
  const [gender, setGender] = useState<"femenino" | "masculino">("femenino");
  const [logoData, setLogoData] = useState<string>("");
  const [editTeamId, setEditTeamId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [membersTeamId, setMembersTeamId] = useState<number | null>(null);
  const [importTeamId, setImportTeamId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setShowForm(true);
      window.history.replaceState({}, "", "/teams");
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await authFetch("/api/teams", {}, token);
      return res.json();
    },
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["team-members", membersTeamId],
    queryFn: async () => {
      if (!membersTeamId) return { members: [] };
      const res = await authFetch(`/api/teams/${membersTeamId}/members`, {}, token);
      return res.json();
    },
    enabled: !!membersTeamId,
  });

  const saveTeam = useMutation({
    mutationFn: async () => {
      const res = await authFetch(editTeamId ? `/api/teams/${editTeamId}` : "/api/teams", {
        method: editTeamId ? "PUT" : "POST",
        body: JSON.stringify({ name, category, color, gender, logoData }),
      }, token);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setShowForm(false);
      setEditTeamId(null);
      setName(""); setCategory(""); setColor(DEFAULT_TEAM_COLOR); setGender("femenino"); setLogoData("");
    },
  });

  const [deleteError, setDeleteError] = useState("");

  const deleteTeam = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/teams/${id}`, { method: "DELETE" }, token);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar el equipo");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setDeleteConfirmId(null);
      setDeleteError("");
    },
    onError: (err: any) => {
      setDeleteError(err.message || "No se pudo eliminar el equipo");
    },
  });

  const regenerateImportToken = useMutation({
    mutationFn: async (teamId: number) => {
      const res = await authFetch(`/api/teams/${teamId}/import-token/regenerate`, { method: "POST" }, token);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const joinTeam = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/teams/join", {
        method: "POST",
        body: JSON.stringify({ shareCode: joinCode.trim().toUpperCase() }),
      }, token);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.error) { setJoinError(data.error); return; }
      qc.invalidateQueries({ queryKey: ["teams"] });
      setShowJoin(false);
      setJoinCode(""); setJoinError("");
    },
    onError: () => setJoinError("Error al unirse"),
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ teamId, memberId, role }: { teamId: number; memberId: number; role: string }) => {
      const res = await authFetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      }, token);
      return res.json();
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["team-members", vars.teamId] }),
  });

  const removeMember = useMutation({
    mutationFn: async ({ teamId, memberId }: { teamId: number; memberId: number }) => {
      await authFetch(`/api/teams/${teamId}/members/${memberId}`, { method: "DELETE" }, token);
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["team-members", vars.teamId] }),
  });

  const copyCode = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 200;
        let w = img.width, h = img.height;
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        setLogoData(canvas.toDataURL("image/png"));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const teams = data?.teams ?? [];
  const importTeam = teams.find((t: any) => t.id === importTeamId);


  const openEditTeam = (team: any) => {
    setEditTeamId(team.id);
    setName(team.name ?? "");
    setCategory(team.category ?? "");
    setColor(team.color ?? DEFAULT_TEAM_COLOR);
    setGender(team.gender === "masculino" ? "masculino" : "femenino");
    setLogoData(team.logoData ?? "");
    setShowForm(true);
  };

  return (
    <>
      <Topbar
        crumbs={[{ label: "Equipos" }]}
        actions={
          <>
            {!isMobile && (
              <button className="btn-ghost" onClick={() => setShowJoin(true)}>Unirse con código</button>
            )}
            <button className="btn-accent" onClick={() => setShowForm(true)}>
              <Icon d={PATHS.plus} size={14} color="#000" strokeWidth={2.2} /> Equipo
            </button>
          </>
        }
      />

    <div className="page-body">
      {isMobile && (
        <button className="btn-ghost" onClick={() => setShowJoin(true)}
          style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}>
          Unirse con código
        </button>
      )}
      <p className="section-label" style={{ marginBottom: 14 }}>
        {teams.length} equipo{teams.length !== 1 ? "s" : ""} registrado{teams.length !== 1 ? "s" : ""}
      </p>

      {/* ── Configuración de campos + Google Form ── */}
      {importTeamId !== null && importTeam && (
        <PlayerFormSetup
          team={importTeam}
          teams={teams}
          onClose={() => setImportTeamId(null)}
          onRegenerateToken={() => regenerateImportToken.mutate(importTeam.id)}
          regenerating={regenerateImportToken.isPending}
        />
      )}

      {/* ── Members modal ── */}
      {membersTeamId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }}>
          <div className="card fade-in" style={{ padding: 24, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", maxHeight: "75vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Miembros del equipo</h2>
              <button onClick={() => setMembersTeamId(null)} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>
            {membersLoading ? (
              <p style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Cargando miembros...</p>
            ) : (membersData?.members ?? []).length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No se encontraron miembros.</p>
            ) : (
              (membersData?.members ?? []).map((m: any) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || m.username}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>@{m.username}</div>
                  </div>
                  {m.role === "owner" ? (
                    <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, flexShrink: 0 }}>Owner</span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <select
                        value={m.role}
                        onChange={e => updateMemberRole.mutate({ teamId: membersTeamId!, memberId: m.id, role: e.target.value })}
                        style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}>
                        <option value="editor">Editor</option>
                        <option value="viewer">Visor</option>
                      </select>
                      <button
                        onClick={() => removeMember.mutate({ teamId: membersTeamId!, memberId: m.id })}
                        style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13, padding: "0 4px" }}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Join modal ── */}
      {showJoin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }}>
          <div className="card fade-in" style={{ padding: 28, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", marginBottom: 0 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Unirse a un equipo</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
              Introduce el código de 8 caracteres del propietario
            </p>

            <label style={labelStyle}>Código del equipo</label>
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Ej: A3F2B1C0" maxLength={8}
              style={{ fontFamily: "monospace", letterSpacing: "0.15em", fontSize: 18, textAlign: "center" }}
              autoFocus />

            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.5 }}>
              Entrarás como <strong style={{ color: "var(--text-primary)" }}>Visor</strong>. El propietario del equipo puede cambiarte el rol después.
            </p>

            {joinError && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.12)", color: "var(--danger)", fontSize: 13, marginTop: 12 }}>
                {joinError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button className="btn-ghost" onClick={() => { setShowJoin(false); setJoinCode(""); setJoinError(""); }}
                style={{ flex: 1 }}>Cancelar</button>
              <button className="btn-primary" onClick={() => joinTeam.mutate()}
                disabled={joinCode.length < 8 || joinTeam.isPending}
                style={{ flex: 1, opacity: joinCode.length < 8 ? 0.5 : 1 }}>
                {joinTeam.isPending ? "Uniéndose..." : "Unirse"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create/Edit modal ── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }}>
          <div className="card fade-in" style={{ padding: 24, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", maxHeight: "85vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{editTeamId ? "Editar equipo" : "Nuevo Equipo"}</h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20 }}>
              Nombre, categoría, escudo, color y género
            </p>

            <label style={labelStyle}>Nombre del equipo</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Cadete Femenino A" autoFocus />

            <label style={labelStyle}>Categoría</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Selecciona categoría</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={labelStyle}>Género del equipo</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([["femenino", "Femenino"], ["masculino", "Masculino"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setGender(v)}
                  style={{
                    flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 600,
                    border: `1px solid ${gender === v ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 10, cursor: "pointer",
                    background: gender === v ? "var(--accent-dim)" : "var(--bg-secondary)",
                    color: gender === v ? "var(--accent)" : "var(--text-secondary)",
                    transition: "all 0.15s",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            <label style={labelStyle}>Escudo del club (opcional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 64, height: 64, borderRadius: 12, cursor: "pointer",
                  border: logoData ? `2px solid ${color}66` : "2px dashed var(--border)",
                  background: logoData ? "var(--bg-secondary)" : "var(--bg-secondary)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", flexShrink: 0,
                }}
              >
                {logoData ? (
                  <img src={logoData} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "var(--text-secondary)" }}>
                    <CameraIcon />
                    <span style={{ fontSize: 9, textAlign: "center" }}>Subir</span>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button className="btn-ghost" onClick={() => fileInputRef.current?.click()}
                  style={{ width: "100%", justifyContent: "center", marginBottom: 6, fontSize: 13 }}>
                  {logoData ? "Cambiar imagen" : "Seleccionar imagen"}
                </button>
                {logoData && (
                  <button onClick={() => { setLogoData(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    style={{ width: "100%", fontSize: 12, padding: "4px 0", background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer" }}>
                    Eliminar escudo
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoChange} />
            </div>

            <label style={labelStyle}>Color del equipo</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {PRESET_COLORS.map(c => (
                <div key={c} onClick={() => setColor(c)} style={{
                  width: 32, height: 32, borderRadius: 8, background: c, cursor: "pointer",
                  border: color === c ? "2px solid white" : "2px solid transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                }} />
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => { setShowForm(false); setEditTeamId(null); setLogoData(""); }}
                style={{ flex: 1 }}>Cancelar</button>
              <button className="btn-primary" onClick={() => saveTeam.mutate()}
                disabled={!name.trim() || saveTeam.isPending}
                style={{ flex: 1, opacity: !name.trim() ? 0.5 : 1 }}>
                {saveTeam.isPending ? "Guardando..." : editTeamId ? "Guardar cambios" : "Crear equipo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete modal ── */}
      {deleteConfirmId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div className="card fade-in" style={{ padding: 24, width: "100%", maxWidth: 360 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>¿Eliminar equipo?</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              Se eliminarán también sus sesiones, jugadoras y fichas asociadas. Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.12)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-ghost" onClick={() => { setDeleteConfirmId(null); setDeleteError(""); }} style={{ flex: 1 }}>Cancelar</button>
              <button className="btn-danger" onClick={() => deleteTeam.mutate(deleteConfirmId)}
                disabled={deleteTeam.isPending} style={{ flex: 1 }}>
                {deleteTeam.isPending ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cargando...</p>
      ) : teams.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(34,211,238,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--accent)" }}>
            <UsersIcon />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Sin equipos</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
            Crea tu primer equipo o únete con un código
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={() => setShowJoin(true)}>Unirse con código</button>
            <button className="btn-primary" onClick={() => setShowForm(true)}>+ Crear equipo</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {teams.map((team: any) => (
            <div key={team.id} className="card" style={{
              padding: "16px",
              borderLeft: `3px solid ${team.color}`,
            }}>
              {/* Top row: badge + name + code */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <TeamBadge team={team} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {team.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {team.category && <span>{team.category} · </span>}
                    <span style={{ textTransform: "capitalize" }}>{team.role}</span>
                  </div>
                </div>
                {team.shareCode && (
                  <button
                    onClick={() => copyCode(team.shareCode, team.id)}
                    style={{
                      fontSize: 11, background: "var(--bg-secondary)",
                      border: "1px solid var(--border)", borderRadius: 8,
                      padding: "4px 10px", cursor: "pointer",
                      color: copiedId === team.id ? "var(--accent-green)" : "var(--text-secondary)",
                      fontFamily: "monospace", letterSpacing: "0.06em", flexShrink: 0,
                    }}>
                    {copiedId === team.id ? "✓ Copiado" : team.shareCode}
                  </button>
                )}
              </div>

              {/* Bottom row: action buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn-ghost" onClick={() => navigate(`/teams/${team.id}/sessions`)}
                  style={{ flex: "1 1 auto", minWidth: 110, fontSize: 13, padding: "8px 12px", justifyContent: "center" }}>
                  Sesiones
                </button>
                <button className="btn-ghost" onClick={() => navigate(`/teams/${team.id}/matches`)}
                  style={{ flex: "1 1 auto", minWidth: 110, fontSize: 13, padding: "8px 12px", justifyContent: "center" }}>
                  Partidos
                </button>
                <button className="btn-ghost" onClick={() => navigate(`/teams/${team.id}/players`)}
                  style={{ flex: "1 1 auto", minWidth: 110, fontSize: 13, padding: "8px 12px", justifyContent: "center" }}>
                  {playerWord(team.gender, true, true)}
                </button>
                <button className="btn-ghost" onClick={() => navigate(`/teams/${team.id}/evaluations`)}
                  style={{ flex: "1 1 auto", minWidth: 110, fontSize: 13, padding: "8px 12px", justifyContent: "center" }}>
                  Valoraciones
                </button>
                {team.role === "owner" && (
                  <button className="btn-ghost" onClick={() => setMembersTeamId(team.id)}
                    style={{ flex: "1 1 auto", minWidth: 110, fontSize: 13, padding: "8px 12px", justifyContent: "center" }}>
                    Miembros
                  </button>
                )}
                {team.role === "owner" && (
                  <button className="btn-ghost" onClick={() => openEditTeam(team)}
                    style={{ flex: "1 1 auto", minWidth: 110, fontSize: 13, padding: "8px 12px", justifyContent: "center" }}>
                    Editar
                  </button>
                )}
                {(team.role === "owner" || team.role === "editor") && (
                  <button className="btn-ghost" onClick={() => setImportTeamId(team.id)}
                    style={{ flex: "1 1 auto", minWidth: 110, fontSize: 13, padding: "8px 12px", justifyContent: "center" }}>
                    Formulario
                  </button>
                )}
                {team.role === "owner" && (
                  <button className="btn-danger" onClick={() => setDeleteConfirmId(team.id)}
                    style={{ fontSize: 13, padding: "8px 14px" }}>
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "var(--text-secondary)", marginBottom: 6, marginTop: 16,
  textTransform: "uppercase", letterSpacing: "0.07em",
};
