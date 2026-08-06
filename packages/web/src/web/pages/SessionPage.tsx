import { capFirst, SESSION_TYPE_OPTIONS } from "../lib/sessionTypes";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "../hooks/useIsMobile";
import { playerWord } from "../lib/gender";
import { authFetch } from "../lib/authFetch";
import { ADDITIONAL_COLOR } from "../lib/additional";
import { AdditionalBadge } from "../components/AdditionalBadge";

interface Session {
  id: number;
  title: string;
  date: string;
  teamId: number | null;
  duration: number;
  objectives: string;
  notes: string;
  pdfData: string;
  pdfName: string;
  physicalPdfData: string;
  physicalPdfName: string;
  createdAt: string;
  sessionType: string;
  microcycle: number;
}

const SESSION_TYPE_META: Record<string, { label: string; color: string }> = Object.fromEntries(
  SESSION_TYPE_OPTIONS.map(o => [o.value, { label: o.label, color: o.color }])
);

type AttendanceStatus = "present" | "absent" | "justified" | "injured";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Presente",
  absent: "Ausente",
  justified: "Justificada",
  injured: "Lesionada",
};

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "#34C759",
  absent: "#ef4444",
  justified: "#f97316",
  injured: "#8E8E93",
};

type SideTab = "attendance" | "annotations" | "injuries";

export default function SessionPage({ id }: { id?: string }) {
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pdfTab, setPdfTab] = useState<"pista" | "fisico">("pista");
  const [sideTab, setSideTab] = useState<SideTab>("attendance");

  const [newAnnotation, setNewAnnotation] = useState("");
  const [annotationError, setAnnotationError] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState<"pista" | "fisico" | null>(null);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editDuration, setEditDuration] = useState(90);
  const [editObjectives, setEditObjectives] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSessionType, setEditSessionType] = useState("");
  const [editMicrocycle, setEditMicrocycle] = useState<number | "">(1);

  // Injury form state
  const [newInjuryPlayerId, setNewInjuryPlayerId] = useState<number | "">("");
  const [newInjuryDesc, setNewInjuryDesc] = useState("");
  const [newInjuryNotes, setNewInjuryNotes] = useState("");
  const [savingInjury, setSavingInjury] = useState(false);

  useEffect(() => {
    if (!id) return;
    authFetch(`/api/sessions/${id}`, {}, token)
      .then(r => r.json())
      .then(d => {
        if (d.session) setSession(d.session);
        else setError("Sesión no encontrada");
        setLoading(false);
      })
      .catch(() => { setError("Error al cargar la sesión"); setLoading(false); });
  }, [id, token]);

  const { data: attendanceData, refetch: refetchAttendance } = useQuery({
    queryKey: ["attendance", id],
    queryFn: async () => {
      const res = await authFetch(`/api/attendance/${id}`, {}, token);
      return res.json();
    },
    enabled: !!id && !!user,
  });

  const { data: annotationsData } = useQuery({
    queryKey: ["annotations", id],
    queryFn: async () => {
      const res = await authFetch(`/api/annotations/${id}`, {}, token);
      return res.json();
    },
    enabled: !!id && !!user,
  });

  // Team info (for gender-aware wording)
  const { data: teamData } = useQuery({
    queryKey: ["team", session?.teamId],
    queryFn: async () => {
      const res = await authFetch(`/api/teams/${session!.teamId}`, {}, token);
      return res.json();
    },
    enabled: !!session?.teamId && !!user,
  });
  const teamGender = teamData?.team?.gender;

  // All players of the team (for injury player selector)
  const { data: playersData } = useQuery({
    queryKey: ["players", session?.teamId],
    queryFn: async () => {
      const res = await authFetch(`/api/players?teamId=${session!.teamId}`, {}, token);
      return res.json();
    },
    enabled: !!session?.teamId && !!user,
  });

  // Active injuries for the team
  const { data: activeInjuriesData, refetch: refetchInjuries } = useQuery({
    queryKey: ["activeInjuries", session?.teamId],
    queryFn: async () => {
      const res = await authFetch(`/api/injuries/active?teamId=${session!.teamId}`, {}, token);
      return res.json();
    },
    enabled: !!session?.teamId && !!user,
  });

  const initAttendance = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/attendance/${id}/init`, { method: "POST" }, token);
      return res.json();
    },
    onSuccess: () => refetchAttendance(),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ playerId, status }: { playerId: number; status: AttendanceStatus }) => {
      await authFetch(`/api/attendance/${id}/${playerId}`, { method: "PUT", body: JSON.stringify({ status }) }, token);
    },
    onSuccess: () => refetchAttendance(),
  });

  const addAnnotation = useMutation({
    mutationFn: async (content: string) => {
      const res = await authFetch(`/api/annotations/${id}`, { method: "POST", body: JSON.stringify({ content }) }, token);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la anotación");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["annotations", id] });
      setNewAnnotation("");
      setAnnotationError("");
    },
    onError: (err: any) => setAnnotationError(err.message || "No se pudo guardar la anotación"),
  });

  const deleteAnnotation = useMutation({
    mutationFn: async (annotId: number) => {
      await authFetch(`/api/annotations/${annotId}`, { method: "DELETE" }, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", id] }),
  });

  // ── Crear lesión ────────────────────────────────────────────────────────────
  const handleCreateInjury = async () => {
    if (!newInjuryPlayerId || !newInjuryDesc.trim()) return;
    setSavingInjury(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await authFetch("/api/injuries", {
        method: "POST",
        body: JSON.stringify({
          playerId: newInjuryPlayerId,
          description: newInjuryDesc,
          medicalNotes: newInjuryNotes,
          dateStart: today,
          type: "lesion",
          zone: "",
          resolved: false,
        }),
      }, token);
      setNewInjuryPlayerId("");
      setNewInjuryDesc("");
      setNewInjuryNotes("");
      refetchInjuries();
      refetchAttendance();
    } finally {
      setSavingInjury(false);
    }
  };

  // ── Dar alta ────────────────────────────────────────────────────────────────
  const handleDischarge = async (injuryId: number) => {
    const today = new Date().toISOString().slice(0, 10);
    await authFetch(`/api/injuries/${injuryId}`, {
      method: "PUT",
      body: JSON.stringify({ resolved: true, dateEnd: today }),
    }, token);
    refetchInjuries();
    refetchAttendance();
  };

  const startEdit = () => {
    if (!session) return;
    setEditTitle(session.title);
    setEditDate(session.date);
    setEditDuration(session.duration);
    setEditObjectives(session.objectives || "");
    setEditNotes(session.notes || "");
    setEditSessionType(session.sessionType || "ataque");
    setEditMicrocycle(session.microcycle ?? 1);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: editTitle,
          date: editDate,
          duration: editDuration,
          objectives: editObjectives,
          notes: editNotes,
          sessionType: editSessionType,
          microcycle: editMicrocycle === "" ? null : Number(editMicrocycle),
        }),
      }, token);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setSession(prev => prev ? { ...prev, ...data.session } : null);
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!session) return;
    if (!window.confirm("¿Seguro que quieres eliminar esta sesión?\n\nSe borrarán también su asistencia y anotaciones. Esta acción no se puede deshacer.")) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/sessions/${session.id}`, { method: "DELETE" }, token);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error al eliminar la sesión");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["sessions-all"] });
      navigate(session.teamId ? `/teams/${session.teamId}/sessions` : "/");
    } catch (err: any) {
      setError(err.message);
      setDeleting(false);
    }
  };

  const handlePdfUpload = async (type: "pista" | "fisico", file: File) => {
    if (!session) return;
    setUploadingPdf(type);
    const reader = new FileReader();
    reader.onload = async () => {
      const pdfData = reader.result as string;
      const pdfName = file.name;
      const body = type === "pista"
        ? { pdfData, pdfName }
        : { physicalPdfData: pdfData, physicalPdfName: pdfName };
      const res = await authFetch(`/api/sessions/${session.id}`, { method: "PUT", body: JSON.stringify(body) }, token);
      const data = await res.json();
      setSession(prev => prev ? { ...prev, ...data.session } : null);
      setUploadingPdf(null);
    };
    reader.readAsDataURL(file);
  };

  const attendance = attendanceData?.attendance ?? [];
  const annotations = annotationsData?.annotations ?? [];
  const allPlayers = playersData?.players ?? [];
  const activeInjuries: any[] = activeInjuriesData?.injuries ?? [];
  const formattedDate = session
    ? capFirst(new Date(session.date + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" }))
    : "";
  const presentCount = attendance.filter((r: any) => r.status === "present").length;

  if (loading) return <div className="page-container" style={{ padding: 24, color: "var(--text-secondary)", fontSize: 14 }}>Cargando sesión...</div>;
  if (error || !session) return (
    <div style={{ padding: 40 }}>
      <p style={{ color: "#ef4444", marginBottom: 16 }}>{error || "Sesión no encontrada"}</p>
      <button className="btn-ghost" onClick={() => navigate("/")}>← Volver</button>
    </div>
  );

  const typeMeta = SESSION_TYPE_META[session.sessionType] ?? SESSION_TYPE_META.ataque;
  const canEdit = teamData?.team?.role === "owner" || teamData?.team?.role === "editor";

  /* ─── INFO HEADER ─── */
  const infoHeader = (
    <div style={{
      padding: isMobile ? "12px 14px" : "14px 20px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-card)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button className="btn-ghost" onClick={() => navigate("/")}
          style={{ padding: "5px 9px", fontSize: 13, flexShrink: 0 }}>←</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, background: "transparent", border: "none", color: "var(--text-primary)", outline: "none", width: "100%" }}
            />
          ) : (
            <h1 style={{
              fontSize: isMobile ? 14 : 16, fontWeight: 700, color: "var(--text-primary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
            }}>{session.title}</h1>
          )}
        </div>

        {editing ? (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button className="btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: 12, padding: "5px 10px" }}>✕</button>
            <button className="btn-primary" onClick={saveEdit} disabled={saving} style={{ fontSize: 12, padding: "5px 12px" }}>
              {saving ? "..." : "Guardar"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button className="btn-ghost" onClick={startEdit} style={{ fontSize: 12, padding: "5px 10px" }}>Editar</button>
            {canEdit && (
              <button className="btn-ghost" onClick={handleDelete} disabled={deleting}
                style={{ fontSize: 12, padding: "5px 10px", color: "#ef4444" }}>
                {deleting ? "..." : "Eliminar"}
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Fecha</span>
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Duración</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="number" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))}
                min={10} max={240} style={{ width: 60, fontSize: 12, padding: "4px 8px", borderRadius: 6 }} />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>min</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tipo</span>
            <select value={editSessionType} onChange={e => setEditSessionType(e.target.value)}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              {SESSION_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Microciclo</span>
            <input type="number" value={editMicrocycle} onChange={e => setEditMicrocycle(e.target.value === "" ? "" : Number(e.target.value))}
              min={1} max={99} style={{ width: 60, fontSize: 12, padding: "4px 8px", borderRadius: 6 }} />
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Objetivos</span>
            <textarea value={editObjectives} onChange={e => setEditObjectives(e.target.value)}
              rows={2} style={{ width: "100%", fontSize: 12, resize: "vertical" }} />
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Notas</span>
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
              rows={2} style={{ width: "100%", fontSize: 12, resize: "vertical" }} />
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: session.objectives ? 8 : 0 }}>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{formattedDate}</span>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>· {session.duration} min</span>
            {session.sessionType && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                background: typeMeta.color + "22", color: typeMeta.color, border: `1px solid ${typeMeta.color}44`,
              }}>{typeMeta.label}</span>
            )}
            {session.microcycle != null && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                background: "rgba(251,191,36,0.12)", color: "var(--accent)", border: "1px solid rgba(251,191,36,0.25)",
              }}>MC {session.microcycle}</span>
            )}
          </div>
          {session.objectives && (
            <p style={{
              fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{session.objectives}</p>
          )}
        </div>
      )}
    </div>
  );

  /* ─── PDF VIEWER ─── */
  function PdfViewer({ type }: { type: "pista" | "fisico" }) {
    const pdfData = type === "pista" ? session!.pdfData : session!.physicalPdfData;
    const pdfName = type === "pista" ? session!.pdfName : session!.physicalPdfName;
    return pdfData ? (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <iframe src={pdfData} title={pdfName} style={{ flex: 1, border: "none", background: "#fff" }} />
        <div style={{ padding: "6px 14px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdfName}</span>
          <label style={{ cursor: "pointer", flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "var(--accent)" }}>Cambiar PDF</span>
            <input type="file" accept="application/pdf" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(type, f); }} />
          </label>
        </div>
      </div>
    ) : (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--bg-secondary)" }}>
        <div style={{ opacity: 0.4 }}>
          {type === "pista" ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
          )}
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Sin PDF de {type === "pista" ? "pista" : "físico"}</p>
        <label style={{ cursor: "pointer" }}>
          <span className="btn-primary" style={{ fontSize: 13, padding: "8px 16px", display: "inline-block" }}>
            {uploadingPdf === type ? "Subiendo..." : "Subir PDF"}
          </span>
          <input type="file" accept="application/pdf" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(type, f); }} />
        </label>
      </div>
    );
  }

  /* ─── PDF TAB BAR ─── */
  const pdfTabBar = (
    <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-card)" }}>
      {(["pista", "fisico"] as const).map(tab => (
        <button key={tab} onClick={() => setPdfTab(tab)} style={{
          flex: 1, padding: "10px 0", fontSize: 12, fontWeight: pdfTab === tab ? 700 : 400,
          background: "none", border: "none", cursor: "pointer",
          color: pdfTab === tab ? "var(--accent)" : "var(--text-secondary)",
          borderBottom: pdfTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
          transition: "all 0.15s",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          {tab === "pista" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
              Sesión Pista
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
              Sesión Físico
            </span>
          )}
        </button>
      ))}
    </div>
  );

  /* ─── ATTENDANCE PANEL ─── */
  const activeAttendance = attendance.filter((r: any) => r.status !== "injured");
  const injuredAttendance = attendance.filter((r: any) => r.status === "injured");

  const attendancePanel = (
    <div>
      {attendance.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 24 }}>
          <div style={{ marginBottom: 10, opacity: 0.4, display: "flex", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg></div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
            {session.teamId ? "Carga la lista de asistencia" : "Esta sesión no tiene equipo asignado"}
          </p>
          {session.teamId && (
            <button className="btn-primary" onClick={() => initAttendance.mutate()} disabled={initAttendance.isPending} style={{ fontSize: 13 }}>
              {initAttendance.isPending ? "Cargando..." : `Cargar ${playerWord(teamGender, true)}`}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Summary badges */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map(s => {
              const count = attendance.filter((r: any) => r.status === s).length;
              return count > 0 ? (
                <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: STATUS_COLORS[s] + "22", color: STATUS_COLORS[s], fontWeight: 600 }}>
                  {count} {STATUS_LABELS[s].toLowerCase()}
                </span>
              ) : null;
            })}
          </div>

          {/* Active players */}
          {activeAttendance.map((record: any) => (
            <div key={record.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 8, background: "var(--bg-secondary)",
              border: `1px solid ${STATUS_COLORS[record.status as AttendanceStatus]}33`,
              borderLeft: record.isAdditional ? `3px solid ${ADDITIONAL_COLOR}` : undefined,
              flexWrap: "wrap",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[record.status as AttendanceStatus], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 80 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                  {record.playerNumber != null ? <span style={{ color: "var(--accent)", marginRight: 2, fontSize: 11 }}>#{record.playerNumber}</span> : null}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{record.playerName}</span>
                  {record.isAdditional && <AdditionalBadge compact />}
                </div>
                {record.playerPosition && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{record.playerPosition}</div>}
              </div>
              <select value={record.status}
                onChange={e => updateStatus.mutate({ playerId: record.playerId, status: e.target.value as AttendanceStatus })}
                style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, background: "var(--bg-card)", border: "1px solid var(--border)", color: STATUS_COLORS[record.status as AttendanceStatus], cursor: "pointer", flexShrink: 0 }}>
                {(["present", "absent", "justified"] as AttendanceStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          ))}

          {/* Injured section */}
          {injuredAttendance.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#e05252", marginTop: 8, marginBottom: 2 }}>
                Lesionadas
              </div>
              {injuredAttendance.map((record: any) => (
                <div key={record.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 8, background: "rgba(224,82,82,0.07)",
                  border: "1px solid rgba(224,82,82,0.2)",
                  flexWrap: "wrap",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e05252", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 80 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {record.playerNumber != null ? <span style={{ color: "var(--accent)", marginRight: 5, fontSize: 11 }}>#{record.playerNumber}</span> : null}
                      {record.playerName}
                    </div>
                    {record.activeInjury && (
                      <div style={{ fontSize: 11, color: "#e05252", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {record.activeInjury.description || "Sin descripción"}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: "#e05252", fontWeight: 600, flexShrink: 0 }}>Baja</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );

  /* ─── ANNOTATIONS PANEL ─── */
  const annotationsPanel = (
    <div style={{ overflow: "hidden", minWidth: 0, width: "100%" }}>
      <div style={{ marginBottom: 14 }}>
        <textarea
          value={newAnnotation}
          onChange={e => setNewAnnotation(e.target.value)}
          placeholder="Escribe una anotación de la sesión..."
          rows={3}
          style={{ width: "100%", fontSize: 13, resize: "none" }}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && newAnnotation.trim()) {
              addAnnotation.mutate(newAnnotation);
            }
          }}
        />
        <button className="btn-primary" onClick={() => addAnnotation.mutate(newAnnotation)}
          disabled={!newAnnotation.trim() || addAnnotation.isPending}
          style={{ width: "100%", fontSize: 13, marginTop: 6, opacity: !newAnnotation.trim() ? 0.5 : 1 }}>
          {addAnnotation.isPending ? "..." : "Añadir anotación"}
        </button>
        {annotationError && (
          <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.12)", color: "var(--danger)", fontSize: 12 }}>
            {annotationError}
          </div>
        )}
      </div>
      {annotations.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", paddingTop: 8 }}>Sin anotaciones</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {annotations.map((note: any) => (
            <div key={note.id} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--bg-secondary)", border: "1px solid var(--border)", overflow: "hidden", minWidth: 0, boxSizing: "border-box", width: "100%" }}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)", whiteSpace: "pre-wrap", margin: 0, wordBreak: "break-word" }}>{note.content}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {new Date(note.createdAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                {canEdit && (
                  <button
                    onClick={() => deleteAnnotation.mutate(note.id)}
                    disabled={deleteAnnotation.isPending}
                    title="Eliminar anotación"
                    style={{
                      marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-secondary)", fontSize: 11, padding: "2px 4px",
                    }}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ─── INJURIES PANEL ─── */
  // Players without active injury (can be injured)
  const injuredPlayerIds = new Set(activeInjuries.map((inj: any) => inj.playerId));
  const healthyPlayers = allPlayers.filter((p: any) => !injuredPlayerIds.has(p.id));

  const injuriesPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Register new injury */}
      <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
          Registrar lesión
        </div>

        {healthyPlayers.length === 0 && allPlayers.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>No hay {playerWord(teamGender, true)} en el equipo.</p>
        ) : healthyPlayers.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{teamGender === "masculino" ? "Todos los" : "Todas las"} {playerWord(teamGender, true)} están lesionad{teamGender === "masculino" ? "os" : "as"}.</p>
        ) : (
          <>
            <select
              value={newInjuryPlayerId}
              onChange={e => setNewInjuryPlayerId(e.target.value ? Number(e.target.value) : "")}
              style={{ fontSize: 13, padding: "7px 10px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: "100%" }}>
              <option value="">— Selecciona {playerWord(teamGender, false)} —</option>
              {healthyPlayers.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.number != null ? `#${p.number} ` : ""}{p.name}
                </option>
              ))}
            </select>

            <textarea
              value={newInjuryDesc}
              onChange={e => setNewInjuryDesc(e.target.value)}
              placeholder="Descripción de la lesión *"
              rows={2}
              style={{ fontSize: 13, resize: "none", width: "100%", borderRadius: 8, padding: "7px 10px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            />

            <textarea
              value={newInjuryNotes}
              onChange={e => setNewInjuryNotes(e.target.value)}
              placeholder="Notas médicas (opcional)"
              rows={2}
              style={{ fontSize: 13, resize: "none", width: "100%", borderRadius: 8, padding: "7px 10px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            />

            <button
              className="btn-primary"
              disabled={!newInjuryPlayerId || !newInjuryDesc.trim() || savingInjury}
              style={{ opacity: (!newInjuryPlayerId || !newInjuryDesc.trim()) ? 0.5 : 1, background: "#e05252", borderColor: "#e05252" }}
              onClick={handleCreateInjury}>
              {savingInjury ? "Guardando..." : "Registrar lesión"}
            </button>
          </>
        )}
      </div>

      {/* Active injuries list */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", marginBottom: 8 }}>
          Bajas activas ({activeInjuries.length})
        </div>

        {activeInjuries.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", paddingTop: 8 }}>
            {teamGender === "masculino" ? "Ningún" : "Ninguna"} {playerWord(teamGender, false)} en baja
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeInjuries.map((inj: any) => (
              <div key={inj.id} style={{
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(224,82,82,0.07)", border: "1px solid rgba(224,82,82,0.2)",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {inj.playerNumber != null ? <span style={{ color: "var(--accent)", marginRight: 5, fontSize: 11 }}>#{inj.playerNumber}</span> : null}
                      {inj.playerName}
                    </div>
                    <div style={{ fontSize: 12, color: "#e05252", marginTop: 2 }}>{inj.description}</div>
                    {inj.medicalNotes && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{inj.medicalNotes}</div>}
                    <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>
                      Desde {new Date(inj.dateStart + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDischarge(inj.id)}
                    style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 6, flexShrink: 0,
                      background: "#22c55e22", border: "1px solid #22c55e55", color: "#22c55e",
                      cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                    }}>
                    Alta
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ─── SIDE TABS CONFIG ─── */
  const sideTabs = [
    { key: "attendance" as SideTab, label: `Asistencia${attendance.length > 0 ? ` (${presentCount}/${attendance.length})` : ""}` },
    { key: "annotations" as SideTab, label: `Anotaciones${annotations.length > 0 ? ` (${annotations.length})` : ""}` },
    { key: "injuries" as SideTab, label: `Lesiones${activeInjuries.length > 0 ? ` (${activeInjuries.length})` : ""}` },
  ];

  /* ══════════════════════════════════════════
     MOBILE LAYOUT
  ══════════════════════════════════════════ */
  if (isMobile) {
    return (
      <div className="fade-in" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {infoHeader}
        {pdfTabBar}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          <PdfViewer type={pdfTab} />
        </div>
        <MobileBottomDrawer
          attendance={attendance}
          attendancePanel={attendancePanel}
          annotations={annotations}
          annotationsPanel={annotationsPanel}
          activeInjuries={activeInjuries}
          injuriesPanel={injuriesPanel}
          presentCount={presentCount}
        />
      </div>
    );
  }

  /* ══════════════════════════════════════════
     DESKTOP LAYOUT
  ══════════════════════════════════════════ */
  return (
    <div className="fade-in" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {infoHeader}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* LEFT: PDF */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
          {pdfTabBar}
          <PdfViewer type={pdfTab} />
        </div>

        {/* RIGHT: Side panel */}
        <div style={{ width: 340, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            {sideTabs.map(tab => (
              <button key={tab.key} onClick={() => setSideTab(tab.key)} style={{
                flex: 1, padding: "10px 4px", fontSize: 11, fontWeight: sideTab === tab.key ? 700 : 400,
                background: "none", border: "none", cursor: "pointer",
                color: sideTab === tab.key ? (tab.key === "injuries" ? "#e05252" : "var(--accent)") : "var(--text-secondary)",
                borderBottom: sideTab === tab.key ? `2px solid ${tab.key === "injuries" ? "#e05252" : "var(--accent)"}` : "2px solid transparent",
                transition: "all 0.15s", whiteSpace: "nowrap",
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 16, minWidth: 0, boxSizing: "border-box" }}>
            {sideTab === "attendance" && attendancePanel}
            {sideTab === "annotations" && annotationsPanel}
            {sideTab === "injuries" && injuriesPanel}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mobile bottom drawer ─── */
function MobileBottomDrawer({
  attendance, attendancePanel, annotations, annotationsPanel,
  activeInjuries, injuriesPanel, presentCount,
}: {
  attendance: any[];
  attendancePanel: React.ReactNode;
  annotations: any[];
  annotationsPanel: React.ReactNode;
  activeInjuries: any[];
  injuriesPanel: React.ReactNode;
  presentCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SideTab>("attendance");

  const tabs = [
    { key: "attendance" as SideTab, label: `Asistencia${attendance.length > 0 ? ` (${presentCount}/${attendance.length})` : ""}` },
    { key: "annotations" as SideTab, label: `Anotaciones${annotations.length > 0 ? ` (${annotations.length})` : ""}` },
    { key: "injuries" as SideTab, label: `Lesiones${activeInjuries.length > 0 ? ` (${activeInjuries.length})` : ""}` },
  ];

  return (
    <div style={{
      borderTop: "1px solid var(--border)",
      background: "var(--bg-card)",
      flexShrink: 0,
      maxHeight: open ? "60vh" : 44,
      transition: "max-height 0.25s ease",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", height: 44, flexShrink: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setOpen(true); }} style={{
            flex: 1, height: "100%", fontSize: 10, fontWeight: tab === t.key && open ? 700 : 400,
            background: "none", border: "none", cursor: "pointer",
            color: tab === t.key && open ? (t.key === "injuries" ? "#e05252" : "var(--accent)") : "var(--text-secondary)",
            borderBottom: tab === t.key && open ? `2px solid ${t.key === "injuries" ? "#e05252" : "var(--accent)"}` : "2px solid transparent",
            padding: "0 4px",
          }}>
            {t.label}
          </button>
        ))}
        <button onClick={() => setOpen(o => !o)} style={{
          width: 40, height: 44, background: "none", border: "none", cursor: "pointer",
          color: "var(--text-secondary)", fontSize: 14, flexShrink: 0,
        }}>
          {open ? "▼" : "▲"}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "12px 14px", minWidth: 0, boxSizing: "border-box" }}>
        {tab === "attendance" && attendancePanel}
        {tab === "annotations" && annotationsPanel}
        {tab === "injuries" && injuriesPanel}
      </div>
    </div>
  );
}
