import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Trash2, Download, MapPin, Clock, Users, FileText, Upload } from "lucide-react";
import { jsPDF } from "jspdf";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import Topbar from "../components/Topbar";
import { ADDITIONAL_COLOR } from "../lib/additional";
import { AdditionalBadge } from "../components/AdditionalBadge";

interface Callup {
  playerId: number;
  playerName: string;
  playerNumber: number | null;
  playerPosition: string | null;
  photoData: string | null;
  called: boolean;
  injured: boolean;
  isAdditional: boolean;
}
interface MatchDocument {
  id: number;
  name: string;
  createdAt: any;
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
  notes: string;
}

function formatDateES(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export default function MatchPage({ id }: { id: string }) {
  const matchId = Number(id);
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const qc = useQueryClient();

    const { data, isLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: async () => {
      const res = await authFetch(`/api/matches/${matchId}`, {}, token);
      if (!res.ok) throw new Error("No encontrado");
      return res.json() as Promise<{ match: Match; callups: Callup[]; documents: MatchDocument[]; role: string }>;
    },
    enabled: !!user && !!matchId,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await authFetch("/api/teams", {}, token);
      return res.json();
    },
    enabled: !!user,
  });

  const match = data?.match;
  const callups = data?.callups ?? [];
  const documents = data?.documents ?? [];
  const role = data?.role ?? "viewer";
  const canEdit = role === "owner" || role === "editor";
  const team = (teamsData?.teams ?? []).find((t: any) => t.id === match?.teamId);

  // Resultado editable
  const [gf, setGf] = useState("");
  const [ga, setGa] = useState("");
  const [savingResult, setSavingResult] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<number | null>(null);
  const [docError, setDocError] = useState("");

  useEffect(() => {
    if (match) {
      setGf(match.goalsFor != null ? String(match.goalsFor) : "");
      setGa(match.goalsAgainst != null ? String(match.goalsAgainst) : "");
    }
  }, [match?.id, match?.goalsFor, match?.goalsAgainst]);

  const toggleCallup = async (playerId: number, called: boolean) => {
    // Optimistic
    qc.setQueryData(["match", matchId], (old: any) => {
      if (!old) return old;
      return { ...old, callups: old.callups.map((c: Callup) => c.playerId === playerId ? { ...c, called } : c) };
    });
    await authFetch(`/api/matches/${matchId}/callups/${playerId}`, {
      method: "PUT",
      body: JSON.stringify({ called }),
    }, token);
    qc.invalidateQueries({ queryKey: ["match", matchId] });
  };

  const saveResult = async () => {
    setSavingResult(true);
    await authFetch(`/api/matches/${matchId}`, {
      method: "PUT",
      body: JSON.stringify({ goalsFor: gf === "" ? null : Number(gf), goalsAgainst: ga === "" ? null : Number(ga) }),
    }, token);
    await qc.invalidateQueries({ queryKey: ["match", matchId] });
    await qc.invalidateQueries({ queryKey: ["matches"] });
    await qc.invalidateQueries({ queryKey: ["matches-all"] });
    setSavingResult(false);
  };

  const handleUploadDoc = async (file: File | undefined) => {
    setDocError("");
    if (!file) return;
    if (file.type !== "application/pdf") { setDocError("El archivo debe ser un PDF."); return; }
    if (file.size > 4_000_000) { setDocError("El PDF supera el límite de 4 MB."); return; }
    setUploadingDoc(true);
    try {
      const pdfData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await authFetch(`/api/matches/${matchId}/documents`, {
        method: "POST",
        body: JSON.stringify({ name: file.name, pdfData }),
      }, token);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setDocError(j.error || "No se pudo subir el PDF.");
      } else {
        await qc.invalidateQueries({ queryKey: ["match", matchId] });
      }
    } finally {
      setUploadingDoc(false);
    }
  };

  const openDoc = async (docId: number) => {
    setOpeningDocId(docId);
    try {
      const res = await authFetch(`/api/matches/${matchId}/documents/${docId}`, {}, token);
      if (!res.ok) { setDocError("No se pudo abrir el PDF."); return; }
      const { document: doc } = await res.json();
      // Solo se aceptan data-urls: evita que un valor manipulado en la BD
      // convierta este fetch en una petición a un servidor externo (SSRF).
      if (typeof doc?.pdfData !== "string" || !doc.pdfData.startsWith("data:application/pdf")) {
        setDocError("El documento no es un PDF válido.");
        return;
      }
      // Convertir data-url a blob y abrir en pestaña nueva
      const resp = await fetch(doc.pdfData);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setOpeningDocId(null);
    }
  };

  const deleteDoc = async (docId: number) => {
    await authFetch(`/api/matches/${matchId}/documents/${docId}`, { method: "DELETE" }, token);
    await qc.invalidateQueries({ queryKey: ["match", matchId] });
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await authFetch(`/api/matches/${matchId}`, { method: "DELETE" }, token);
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["matches-all"] });
      navigate(match ? `/teams/${match.teamId}/matches` : "/");
    } else {
      setDeleting(false);
    }
  };

  const exportPDF = () => {
    if (!match) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 48;
    let y = 54;
    const accent = team?.color || "#22d3ee";

    // Escudo
    if (team?.logoData) {
      try { doc.addImage(team.logoData, "PNG", margin, y - 8, 48, 48); } catch { /* ignore */ }
    }
    const textX = team?.logoData ? margin + 62 : margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20, 20, 20);
    doc.text("CONVOCATORIA", textX, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text(team?.name || "Equipo", textX, y + 26);
    y += 66;

    // Línea de color
    const rgb = hexToRgb(accent);
    doc.setDrawColor(rgb.r, rgb.g, rgb.b);
    doc.setLineWidth(2);
    doc.line(margin, y, pageW - margin, y);
    y += 24;

    // Datos del partido
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    const title = `${match.homeAway === "home" ? "Local" : "Visitante"} vs ${match.opponent || "Rival"}`;
    doc.text(title, margin, y);
    y += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(70, 70, 70);
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    doc.text(capitalize(formatDateES(match.date)), margin, y); y += 16;
    const timeLine: string[] = [];
    if (match.time) timeLine.push(`Partido: ${match.time}h`);
    if (match.meetingTime) timeLine.push(`Citación: ${match.meetingTime}h`);
    if (timeLine.length) { doc.text(timeLine.join("    "), margin, y); y += 16; }
    if (match.venue) { doc.text(`Lugar: ${match.venue}`, margin, y); y += 16; }
    y += 10;

    // Lista de convocados
    const called = callups.filter(c => c.called).sort((a, b) => (a.playerNumber ?? 999) - (b.playerNumber ?? 999));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(`CONVOCADOS (${called.length})`, margin, y);
    y += 8;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    if (called.length === 0) {
      doc.setTextColor(150, 150, 150);
      doc.text("Sin convocados todavía.", margin, y);
      y += 18;
    } else {
      called.forEach((c, i) => {
        if (y > 780) { doc.addPage(); y = 54; }
        const num = c.playerNumber != null ? `${c.playerNumber}.` : `${i + 1}.`;
        doc.setFont("helvetica", "bold");
        doc.text(num, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(c.playerName + (c.isAdditional ? "  (adicional)" : ""), margin + 28, y);
        if (c.playerPosition) {
          doc.setTextColor(140, 140, 140);
          doc.setFontSize(9.5);
          doc.text(c.playerPosition, pageW - margin, y, { align: "right" });
          doc.setFontSize(11);
          doc.setTextColor(40, 40, 40);
        }
        y += 20;
      });
    }

    // Pie
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text("CoachHub", margin, 812);

    const fileName = `convocatoria_${(match.opponent || "partido").replace(/\s+/g, "_")}_${match.date}.pdf`;
    doc.save(fileName);
  };

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</div>;
  }
  if (!match) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>
        <p>Partido no encontrado.</p>
        <button className="btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate("/")}>Volver</button>
      </div>
    );
  }

  const homeLabel = match.homeAway === "home" ? "Local" : "Visitante";
  const homeColor = match.homeAway === "home" ? "#22c55e" : "#3b82f6";
  const calledCount = callups.filter(c => c.called).length;
  const played = match.goalsFor != null && match.goalsAgainst != null;
  const win = played && match.goalsFor! > match.goalsAgainst!;
  const draw = played && match.goalsFor === match.goalsAgainst;

  return (
    <>
      <Topbar
        crumbs={[
          { label: "Partidos", href: match ? `/teams/${match.teamId}/matches` : "/" },
          { label: match?.opponent || "Partido" },
        ]}
        actions={
          <>
            <button className="btn-ghost" onClick={() => navigate(match ? `/teams/${match.teamId}/matches` : "/")}>
              <ArrowLeft size={14} /> Volver
            </button>
            <button className="btn-ghost" onClick={exportPDF}>
              <Download size={14} /> PDF
            </button>
            {canEdit && (
              <button className="btn-ghost" onClick={() => setShowDelete(true)} style={{ color: "#ef4444" }}>
                <Trash2 size={14} /> Eliminar
              </button>
            )}
          </>
        }
      />

      <div className="page-body" style={{ maxWidth: 860, paddingBottom: 80 }}>
        {/* Match card */}
        <div className="card" style={{ padding: "22px 24px", marginBottom: 20, borderLeft: `3px solid ${homeColor}` }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: `${homeColor}22`, border: `1px solid ${homeColor}55`, color: homeColor }}>{homeLabel}</span>
            {team && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: `${team.color}22`, border: `1px solid ${team.color}55`, color: team.color }}>{team.name}</span>}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.01em" }}>
            {match.opponent || "Rival por definir"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>{formatDateES(match.date)}</p>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13, color: "var(--text-secondary)" }}>
            {match.time && <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={14} /> Partido {match.time}h</span>}
            {match.meetingTime && <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Users size={14} /> Citación {match.meetingTime}h</span>}
            {match.venue && <span style={{ display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> {match.venue}</span>}
          </div>
          {match.notes && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 14, lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 12 }}>{match.notes}</p>}
        </div>

        {/* Resultado */}
        <div className="card" style={{ padding: "20px 24px", marginBottom: 20 }}>
          <p className="label-caps" style={{ marginBottom: 14 }}>Resultado</p>
          {played && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: canEdit ? 16 : 0 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: "var(--text-primary)" }}>{match.goalsFor} - {match.goalsAgainst}</span>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 12, background: draw ? "rgba(161,161,170,0.2)" : win ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)", color: draw ? "#a1a1aa" : win ? "#22c55e" : "#ef4444" }}>
                {draw ? "Empate" : win ? "Victoria" : "Derrota"}
              </span>
            </div>
          )}
          {canEdit ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{team?.name || "Nosotros"}</label>
                <input type="number" min={0} value={gf} onChange={e => setGf(e.target.value)} placeholder="—" style={{ width: 72, textAlign: "center", fontSize: 18, fontWeight: 700 }} />
              </div>
              <span style={{ fontSize: 20, color: "var(--text-muted)", paddingBottom: 8 }}>-</span>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{match.opponent || "Rival"}</label>
                <input type="number" min={0} value={ga} onChange={e => setGa(e.target.value)} placeholder="—" style={{ width: 72, textAlign: "center", fontSize: 18, fontWeight: 700 }} />
              </div>
              <button className="btn-primary" onClick={saveResult} disabled={savingResult} style={{ fontSize: 13, marginLeft: 4 }}>
                {savingResult ? "..." : "Guardar"}
              </button>
            </div>
          ) : !played && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Sin resultado todavía.</p>
          )}
        </div>

        {/* Documentos de preparación */}
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
            <p className="label-caps" style={{ margin: 0 }}>Preparación del partido · {documents.length} PDF{documents.length === 1 ? "" : "s"}</p>
            {canEdit && (
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 6, cursor: uploadingDoc ? "default" : "pointer",
                fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 20,
                border: "1px solid var(--accent)", color: "var(--accent)", background: "var(--accent-dim)",
                opacity: uploadingDoc ? 0.6 : 1,
              }}>
                <Upload size={14} /> {uploadingDoc ? "Subiendo..." : "Subir PDF"}
                <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={uploadingDoc}
                  onChange={e => { handleUploadDoc(e.target.files?.[0]); e.currentTarget.value = ""; }} />
              </label>
            )}
          </div>

          {docError && <p style={{ fontSize: 12, color: "#ef4444", margin: "0 0 12px" }}>{docError}</p>}

          {documents.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              No hay documentos de preparación.{canEdit ? " Sube un PDF (preparación, informe del rival...)." : ""}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {documents.map(doc => (
                <div key={doc.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 10,
                  background: "var(--bg-secondary)", border: "1px solid var(--border)",
                }}>
                  <FileText size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <button onClick={() => openDoc(doc.id)} style={{
                    flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
                    background: "transparent", border: "none", padding: 0,
                    fontSize: 14, fontWeight: 500, color: "var(--text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {doc.name || "documento.pdf"}
                  </button>
                  <button onClick={() => openDoc(doc.id)} title="Abrir" style={{
                    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 16, cursor: "pointer",
                    border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)",
                  }}>
                    <Download size={13} /> {openingDocId === doc.id ? "Abriendo..." : "Abrir"}
                  </button>
                  {canEdit && (
                    <button onClick={() => deleteDoc(doc.id)} title="Eliminar" style={{
                      flexShrink: 0, display: "inline-flex", alignItems: "center", cursor: "pointer",
                      padding: 6, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "#ef4444",
                    }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Convocatoria */}
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p className="label-caps" style={{ margin: 0 }}>Convocatoria · {calledCount} convocad{calledCount === 1 ? "o" : "os"}</p>
          </div>

          {callups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)" }}>
              <p style={{ fontSize: 13, marginBottom: 6 }}>Este equipo no tiene jugadores en la plantilla.</p>
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate(`/teams/${match.teamId}/players`)}>Ir a la plantilla</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {callups.map(c => (
                <div key={c.playerId} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 10,
                  background: c.called ? "rgba(34,197,94,0.06)" : "var(--bg-secondary)",
                  border: `1px solid ${c.called ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
                  borderLeft: c.isAdditional ? `3px solid ${ADDITIONAL_COLOR}` : undefined,
                  opacity: c.injured && !c.called ? 0.7 : 1,
                }}>
                  {/* Avatar / número */}
                  <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>
                    {c.photoData ? <img src={c.photoData} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (c.playerNumber ?? "?")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                      {c.playerName}
                      {c.isAdditional && <AdditionalBadge compact />}
                      {c.injured && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>Lesionado</span>}
                    </div>
                    {c.playerPosition && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{c.playerPosition}</div>}
                  </div>
                  {canEdit ? (
                    <button
                      onClick={() => toggleCallup(c.playerId, !c.called)}
                      style={{
                        flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 20, cursor: "pointer",
                        border: `1px solid ${c.called ? "rgba(34,197,94,0.5)" : "var(--border)"}`,
                        background: c.called ? "rgba(34,197,94,0.18)" : "transparent",
                        color: c.called ? "#22c55e" : "var(--text-muted)",
                        transition: "all 0.15s",
                      }}>
                      {c.called ? "✓ Convocado" : "Convocar"}
                    </button>
                  ) : (
                    <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: c.called ? "#22c55e" : "var(--text-muted)" }}>
                      {c.called ? "Convocado" : "No"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Delete modal */}
      {showDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div className="card fade-in" style={{ padding: 24, width: "100%", maxWidth: 360 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>¿Eliminar partido?</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              Se eliminará el partido y su convocatoria. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1 }}>Cancelar</button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleting} style={{ flex: 1 }}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}
