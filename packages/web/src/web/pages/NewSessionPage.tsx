import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, FileText, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import Topbar from "../components/Topbar";

const SESSION_TYPES = [
  { value: "ataque",      label: "Ataque",               color: "#22d3ee" },
  { value: "defensa",     label: "Defensa",               color: "#3b82f6" },
  { value: "transicion",  label: "Transición",            color: "#22c55e" },
  { value: "preparacion", label: "Preparación de partido", color: "#a855f7" },
];

export default function NewSessionPage() {
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const physicalFileInputRef = useRef<HTMLInputElement>(null);

  // Preselecciona el equipo si venimos de /sessions/new?teamId=X (ej. desde la vista de un equipo)
  const preselectedTeamId = (() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("teamId");
    return v ? Number(v) : "";
  })();

  const preselectedDate = (() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("date");
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().split("T")[0];
  })();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(preselectedDate);
  const [teamId, setTeamId] = useState<number | "">(preselectedTeamId);
  const [duration, setDuration] = useState(90);
  const [objectives, setObjectives] = useState("");
  const [notes, setNotes] = useState("");
  const [sessionType, setSessionType] = useState("ataque");
  const [pdfData, setPdfData] = useState<string>("");
  const [pdfName, setPdfName] = useState<string>("");
  const [physicalPdfData, setPhysicalPdfData] = useState<string>("");
  const [physicalPdfName, setPhysicalPdfName] = useState<string>("");
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  // true cuando la petición de equipos ya ha terminado (para no mostrar
  // "no tienes equipos" mientras aún se están cargando).
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Carga de equipos (una sola vez, en efecto: nunca durante el render)
  useEffect(() => {
    let cancelled = false;
    authFetch("/api/teams", {}, token)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setTeamsLoaded(true);
        const list = d.teams || [];
        setTeams(list);
        // Si solo hay un equipo y no venía preseleccionado por URL, lo seleccionamos automáticamente
        if (!preselectedTeamId && list.length === 1) {
          setTeamId(list[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) { setTeamsLoaded(true); setError("No se han podido cargar los equipos"); }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readPdfFile = (file: File, onDone: (name: string, data: string) => void) => {
    if (file.type !== "application/pdf") {
      setError("Solo se admiten archivos PDF");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => onDone(file.name, ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readPdfFile(file, (name, data) => { setPdfName(name); setPdfData(data); });
  };

  const handlePhysicalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readPdfFile(file, (name, data) => { setPhysicalPdfName(name); setPhysicalPdfData(data); });
  };

  const removePdf = () => {
    setPdfData(""); setPdfName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhysicalPdf = () => {
    setPhysicalPdfData(""); setPhysicalPdfName("");
    if (physicalFileInputRef.current) physicalFileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    readPdfFile(file, (name, data) => { setPdfName(name); setPdfData(data); });
  };

  const handlePhysicalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    readPdfFile(file, (name, data) => { setPhysicalPdfName(name); setPhysicalPdfData(data); });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("El título es obligatorio");
      return;
    }
    if (!teamId) {
      setError("Debes seleccionar un equipo para la sesión");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          date,
          teamId: teamId || null,
          duration,
          objectives,
          notes,
          sessionType,
          pdfData,
          pdfName,
          physicalPdfData,
          physicalPdfName,
        }),
      }, token);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      navigate(`/sessions/${data.session.id}`);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "var(--text-primary)",
  };

  return (
    <>
      <Topbar
        crumbs={[{ label: "Nueva sesión" }]}
        actions={
          <button className="btn-ghost" onClick={() => window.history.back()}>
            <ArrowLeft size={14} /> Volver
          </button>
        }
      />
    <div style={{ color: "var(--text-primary)" }}>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
            {error}
          </div>
        )}

        {/* Título */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Título *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Sesión de defensa individual"
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors"
            style={inputStyle}
          />
        </div>

        {/* Tipo de sesión */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-secondary)" }}>Tipo de sesión</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {SESSION_TYPES.map((t) => {
              const selected = sessionType === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setSessionType(t.value)}
                  style={{
                    background: selected ? `${t.color}20` : "var(--bg-surface)",
                    border: `2px solid ${selected ? t.color : "var(--border)"}`,
                    color: selected ? t.color : "var(--text-secondary)",
                    borderRadius: 10,
                    padding: "12px 16px",
                    fontSize: 13,
                    fontWeight: selected ? 700 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    letterSpacing: "0.01em",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0, display: "inline-block" }} />
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fecha + Duración */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Duración (min)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={10} max={240}
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Equipo */}
        {teamsLoaded && teams.length === 0 ? (
          <div className="px-4 py-4 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}>
            Todavía no tienes ningún equipo. <button onClick={() => navigate("/teams")} style={{ color: "#22d3ee", textDecoration: "underline", fontWeight: 600 }}>Crea uno primero</button> para poder registrar sesiones.
          </div>
        ) : (
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Equipo *</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={inputStyle}
            >
              <option value="">Selecciona un equipo</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Objetivos */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Objetivos</label>
          <textarea
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            placeholder="Objetivos de la sesión..."
            rows={3}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
            style={inputStyle}
          />
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas adicionales..."
            rows={3}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
            style={inputStyle}
          />
        </div>

        {/* PDF Pista */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>
            PDF Sesión de Pista
          </label>
          {pdfData ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <FileText size={20} style={{ color: "#22d3ee" }} />
                <span className="text-sm truncate max-w-xs">{pdfName}</span>
              </div>
              <button onClick={removePdf} className="transition-opacity hover:opacity-70" style={{ color: "var(--text-secondary)" }}>
                <X size={18} />
              </button>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-lg cursor-pointer"
              style={{ background: "var(--bg-surface)", border: "2px dashed rgba(255,255,255,0.06)" }}
            >
              <Upload size={28} style={{ color: "var(--text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Arrastra un PDF aquí o <span style={{ color: "#22d3ee" }}>haz clic para seleccionar</span>
              </p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />
        </div>

        {/* PDF Físico */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>
            PDF Preparación Física <span style={{ color: "#4A4A5A", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
          </label>
          {physicalPdfData ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <FileText size={20} style={{ color: "#3b82f6" }} />
                <span className="text-sm truncate max-w-xs">{physicalPdfName}</span>
              </div>
              <button onClick={removePhysicalPdf} className="transition-opacity hover:opacity-70" style={{ color: "var(--text-secondary)" }}>
                <X size={18} />
              </button>
            </div>
          ) : (
            <div
              onDrop={handlePhysicalDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => physicalFileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-lg cursor-pointer"
              style={{ background: "var(--bg-surface)", border: "2px dashed rgba(255,255,255,0.06)" }}
            >
              <Upload size={24} style={{ color: "var(--text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Arrastra el PDF de físico aquí o <span style={{ color: "#3b82f6" }}>haz clic para seleccionar</span>
              </p>
            </div>
          )}
          <input ref={physicalFileInputRef} type="file" accept="application/pdf" onChange={handlePhysicalFileSelect} className="hidden" />
        </div>

        {/* Guardar */}
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !teamId}
          className="w-full py-4 rounded-lg font-semibold text-sm uppercase tracking-widest transition-opacity"
          style={{ background: "var(--accent)", color: "#000", opacity: (saving || !title.trim() || !teamId) ? 0.5 : 1 }}
        >
          {saving ? "Guardando..." : "Guardar Sesión"}
        </button>
      </div>
    </div>
    </>
  );
}
