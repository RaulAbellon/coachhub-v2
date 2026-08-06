import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import { playerWord } from "../lib/gender";
import {
  FIELD_TYPE_LABEL,
  FIELD_TYPE_OPTIONS,
  GOOGLE_FORM_HINT,
  NEEDS_OPTIONS,
  buildAppsScript,
  type FieldType,
  type FormField,
} from "../lib/formFields";

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "var(--text-secondary)", marginBottom: 6, marginTop: 16,
  textTransform: "uppercase", letterSpacing: "0.07em",
};

type Props = {
  team: any;
  teams: any[];
  onClose: () => void;
  onRegenerateToken: () => void;
  regenerating: boolean;
};

export function PlayerFormSetup({ team, teams, onClose, onRegenerateToken, regenerating }: Props) {
  const { token } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"campos" | "formulario">("campos");
  const [copiedImportUrl, setCopiedImportUrl] = useState(false);
  const [showFullImportUrl, setShowFullImportUrl] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Nuevo campo
  const [showNewField, setShowNewField] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newOptions, setNewOptions] = useState<string[]>([]);
  const [newOptionDraft, setNewOptionDraft] = useState("");
  const [error, setError] = useState("");

  // Copiar de otro equipo
  const [copySourceId, setCopySourceId] = useState<number | "">("");
  const [copyPreview, setCopyPreview] = useState<any>(null);

  // Edición de etiqueta / opciones
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editOptionDraft, setEditOptionDraft] = useState("");

  const importUrl = `${window.location.origin}/api/players/import/${team.importToken}`;
  const appsScript = buildAppsScript(importUrl);

  const { data, isLoading } = useQuery({
    queryKey: ["form-fields", team.id],
    queryFn: async () => {
      const res = await authFetch(`/api/form-fields/${team.id}`, {}, token);
      if (!res.ok) throw new Error("Error cargando los campos");
      return res.json();
    },
  });

  const fields: FormField[] = data?.fields ?? [];
  const activeFields = fields.filter(f => f.enabled);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["form-fields", team.id] });
    qc.invalidateQueries({ queryKey: ["players"] });
  };

  const call = async (url: string, options: RequestInit) => {
    const res = await authFetch(url, options, token);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error ?? "Error"), { body, status: res.status });
    return body;
  };

  const createField = useMutation({
    mutationFn: () => call(`/api/form-fields/${team.id}`, {
      method: "POST",
      body: JSON.stringify({ label: newLabel.trim(), type: newType, options: newOptions }),
    }),
    onSuccess: () => {
      setShowNewField(false);
      setNewLabel(""); setNewType("text"); setNewOptions([]); setNewOptionDraft(""); setError("");
      invalidate();
    },
    onError: (e: any) => setError(e.message),
  });

  const updateField = useMutation({
    mutationFn: (vars: { id: number; patch: Record<string, unknown> }) =>
      call(`/api/form-fields/${team.id}/${vars.id}`, { method: "PUT", body: JSON.stringify(vars.patch) }),
    onSuccess: () => { setEditingId(null); setError(""); invalidate(); },
    onError: (e: any) => setError(e.message),
  });

  const deleteField = useMutation({
    mutationFn: async (id: number) => {
      try {
        return await call(`/api/form-fields/${team.id}/${id}`, { method: "DELETE" });
      } catch (e: any) {
        if (e.status === 409 && e.body?.needsConfirm) {
          const ok = confirm(
            `Este campo tiene datos de ${e.body.affected} jugador(es). Si lo eliminas, los datos se ocultarán pero no se borrarán. ¿Continuar?`,
          );
          if (!ok) return null;
          return call(`/api/form-fields/${team.id}/${id}?confirm=true`, { method: "DELETE" });
        }
        throw e;
      }
    },
    onSuccess: () => { setError(""); invalidate(); },
    onError: (e: any) => setError(e.message),
  });

  const reorder = useMutation({
    mutationFn: (order: number[]) =>
      call(`/api/form-fields/${team.id}/reorder`, { method: "PUT", body: JSON.stringify({ order }) }),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.message),
  });

  const copyFrom = useMutation({
    mutationFn: (vars: { sourceTeamId: number; confirm: boolean }) =>
      call(`/api/form-fields/${team.id}/copy-from/${vars.sourceTeamId}${vars.confirm ? "?confirm=true" : ""}`, { method: "POST" }),
    onSuccess: (body: any, vars) => {
      setError("");
      if (vars.confirm) { setCopyPreview(null); setCopySourceId(""); invalidate(); }
      else setCopyPreview(body.preview);
    },
    onError: (e: any) => setError(e.message),
  });

  const move = (index: number, dir: -1 | 1) => {
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate(next.map(f => f.id));
  };

  const startEdit = (f: FormField) => {
    setEditingId(f.id);
    setEditLabel(f.label);
    setEditOptions(f.options ?? []);
    setEditOptionDraft("");
    setError("");
  };

  const otherTeams = teams.filter(t => t.id !== team.id);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }}>
      <div className="card fade-in" style={{ padding: 24, width: "100%", maxWidth: 580, borderRadius: "20px 20px 0 0", maxHeight: "88vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Fichas de {playerWord(team.gender, true)}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
          {team.name} · define qué datos pides y rellena las fichas con un Google Form
        </p>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <button className={tab === "campos" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("campos")}
            style={{ flex: 1, justifyContent: "center", fontSize: 13 }}>
            Campos de la ficha
          </button>
          <button className={tab === "formulario" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("formulario")}
            style={{ flex: 1, justifyContent: "center", fontSize: 13 }}>
            Google Form
          </button>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "#ef4444", marginTop: 12, lineHeight: 1.5 }}>{error}</p>
        )}

        {/* ═══════════ TAB CAMPOS ═══════════ */}
        {tab === "campos" && (
          <>
            <p style={{ ...labelStyle, marginTop: 16 }}>
              {activeFields.length} campo{activeFields.length !== 1 ? "s" : ""} activo{activeFields.length !== 1 ? "s" : ""}
            </p>

            {isLoading ? (
              <p style={{ color: "var(--text-secondary)", fontSize: 13, padding: "16px 0" }}>Cargando campos...</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {fields.map((f, i) => (
                  <div key={f.id} className="card" style={{
                    padding: "10px 12px", background: "var(--bg-secondary)",
                    opacity: f.enabled ? 1 : 0.5,
                  }}>
                    {editingId === f.id ? (
                      <div>
                        <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                          placeholder="Etiqueta" style={{ fontSize: 13, marginBottom: 8 }} />
                        {NEEDS_OPTIONS.includes(f.type) && (
                          <OptionsEditor
                            options={editOptions}
                            draft={editOptionDraft}
                            setDraft={setEditOptionDraft}
                            onAdd={v => setEditOptions(o => [...o, v])}
                            onRemove={idx => setEditOptions(o => o.filter((_, k) => k !== idx))}
                          />
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button className="btn-primary" style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
                            disabled={updateField.isPending}
                            onClick={() => updateField.mutate({
                              id: f.id,
                              patch: NEEDS_OPTIONS.includes(f.type)
                                ? { label: editLabel, options: editOptions }
                                : { label: editLabel },
                            })}>
                            Guardar
                          </button>
                          <button className="btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
                            onClick={() => setEditingId(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <button onClick={() => move(i, -1)} disabled={i === 0}
                            title="Subir"
                            style={arrowStyle(i === 0)}>▲</button>
                          <button onClick={() => move(i, 1)} disabled={i === fields.length - 1}
                            title="Bajar"
                            style={arrowStyle(i === fields.length - 1)}>▼</button>
                        </div>

                        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {f.label}
                            {f.locked && (
                              <span style={{ fontSize: 9.5, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                clave
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            {FIELD_TYPE_LABEL[f.type]}
                            {f.options?.length > 0 ? ` · ${f.options.length} opciones` : ""}
                            {f.isBuiltin ? " · por defecto" : " · personalizado"}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => startEdit(f)}
                            style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: "0 2px" }}>
                            Editar
                          </button>
                          <button
                            onClick={() => updateField.mutate({ id: f.id, patch: { enabled: !f.enabled } })}
                            disabled={f.locked}
                            title={f.locked ? "Este campo es obligatorio: identifica a cada jugador" : f.enabled ? "Desactivar" : "Activar"}
                            style={{
                              width: 42, height: 24, borderRadius: 12, border: "none", flexShrink: 0,
                              cursor: f.locked ? "not-allowed" : "pointer",
                              background: f.enabled ? "var(--accent)" : "var(--border)",
                              position: "relative", opacity: f.locked ? 0.4 : 1,
                            }}>
                            <span style={{
                              position: "absolute", top: 3, left: f.enabled ? 21 : 3,
                              width: 18, height: 18, borderRadius: 9, background: "#fff",
                              transition: "left 0.15s",
                            }} />
                          </button>
                          {!f.isBuiltin && (
                            <button onClick={() => deleteField.mutate(f.id)}
                              style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Añadir campo ── */}
            {showNewField ? (
              <div className="card" style={{ padding: 14, marginTop: 12, background: "var(--bg-secondary)" }}>
                <label style={{ ...labelStyle, marginTop: 0 }}>Etiqueta del campo</label>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  placeholder="Ej: Velocidad de lanzamiento (km/h)" style={{ fontSize: 13 }} />
                <label style={labelStyle}>Tipo de respuesta</label>
                <select value={newType} onChange={e => { setNewType(e.target.value as FieldType); setNewOptions([]); }}
                  style={{ fontSize: 13 }}>
                  {FIELD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {NEEDS_OPTIONS.includes(newType) && (
                  <>
                    <label style={labelStyle}>Opciones</label>
                    <OptionsEditor
                      options={newOptions}
                      draft={newOptionDraft}
                      setDraft={setNewOptionDraft}
                      onAdd={v => setNewOptions(o => [...o, v])}
                      onRemove={idx => setNewOptions(o => o.filter((_, k) => k !== idx))}
                    />
                  </>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }}
                    disabled={createField.isPending || !newLabel.trim()}
                    onClick={() => createField.mutate()}>
                    {createField.isPending ? "Añadiendo..." : "Añadir campo"}
                  </button>
                  <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => { setShowNewField(false); setError(""); }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button className="btn-ghost" onClick={() => { setShowNewField(true); setError(""); }}
                style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
                + Añadir campo propio
              </button>
            )}

            {/* ── Copiar de otro equipo ── */}
            {otherTeams.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <label style={{ ...labelStyle, marginTop: 0 }}>Copiar configuración de otro equipo</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={copySourceId}
                    onChange={e => { setCopySourceId(e.target.value ? Number(e.target.value) : ""); setCopyPreview(null); }}
                    style={{ fontSize: 13 }}>
                    <option value="">Selecciona un equipo...</option>
                    {otherTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className="btn-ghost" style={{ flexShrink: 0 }}
                    disabled={!copySourceId || copyFrom.isPending}
                    onClick={() => copyFrom.mutate({ sourceTeamId: Number(copySourceId), confirm: false })}>
                    Ver cambios
                  </button>
                </div>

                {copyPreview && (
                  <div className="card" style={{ padding: 12, marginTop: 10, background: "var(--bg-secondary)", fontSize: 12, lineHeight: 1.7 }}>
                    <div><strong>Se añadirán:</strong> {copyPreview.nuevos.length > 0 ? copyPreview.nuevos.map((f: any) => f.label).join(", ") : "ninguno"}</div>
                    <div><strong>Se actualizarán:</strong> {copyPreview.actualizados.length > 0 ? copyPreview.actualizados.map((f: any) => f.label).join(", ") : "ninguno"}</div>
                    <div style={{ color: "var(--text-secondary)" }}>
                      <strong>Se quedan como están:</strong> {copyPreview.soloEnDestino.length > 0 ? copyPreview.soloEnDestino.map((f: any) => f.label).join(", ") : "ninguno"}
                    </div>
                    <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10, fontSize: 12 }}
                      disabled={copyFrom.isPending}
                      onClick={() => copyFrom.mutate({ sourceTeamId: Number(copySourceId), confirm: true })}>
                      {copyFrom.isPending ? "Copiando..." : "Confirmar copia"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══════════ TAB GOOGLE FORM ═══════════ */}
        {tab === "formulario" && (
          <>
            <p style={{ ...labelStyle, marginTop: 16 }}>1. Crea un Google Form con estas preguntas</p>
            <div className="card" style={{ padding: "12px 14px", background: "var(--bg-secondary)", fontSize: 12.5, lineHeight: 1.9, color: "var(--text-secondary)" }}>
              {activeFields.length === 0 ? (
                <div>No hay campos activos. Actívalos en la pestaña "Campos de la ficha".</div>
              ) : activeFields.map(f => (
                <div key={f.id}>
                  • <strong style={{ color: "var(--text-primary)" }}>{f.label}</strong> — {GOOGLE_FORM_HINT[f.type]}
                  {f.options?.length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 12, lineHeight: 1.5 }}>
                      opciones: {f.options.join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
              El título de cada pregunta debe parecerse a la etiqueta del campo. No importan tildes, mayúsculas
              ni paréntesis: "Peso (kg)", "peso" y "PESO" se reconocen igual. Las preguntas que no coincidan con
              ningún campo se ignoran, así que puedes añadir preguntas extra al formulario sin romper nada.
            </p>

            <p style={labelStyle}>2. Copia tu enlace de importación (único para este equipo)</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                readOnly
                type={showFullImportUrl ? "text" : "password"}
                value={importUrl}
                style={{ fontSize: 11, fontFamily: "monospace" }}
                onFocus={e => showFullImportUrl && e.target.select()}
              />
              <button className="btn-ghost" onClick={() => setShowFullImportUrl(v => !v)} style={{ flexShrink: 0 }}>
                {showFullImportUrl ? "Ocultar" : "Ver"}
              </button>
              <button className="btn-ghost" style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                onClick={() => {
                  navigator.clipboard.writeText(importUrl);
                  setCopiedImportUrl(true);
                  setTimeout(() => setCopiedImportUrl(false), 2000);
                }}>
                {copiedImportUrl ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <button
              onClick={() => { if (confirm("Esto invalidará el enlace anterior. ¿Continuar?")) onRegenerateToken(); }}
              disabled={regenerating}
              style={{ marginTop: 8, fontSize: 11.5, background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              {regenerating ? "Regenerando..." : "Regenerar enlace (invalida el anterior)"}
            </button>

            <p style={labelStyle}>3. En las respuestas del formulario, abre Extensiones → Apps Script y pega esto</p>
            <div style={{ position: "relative" }}>
              <pre style={{
                background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10,
                padding: 14, fontSize: 10.5, lineHeight: 1.6, overflowX: "auto", color: "var(--text-secondary)",
                fontFamily: "monospace", whiteSpace: "pre",
              }}>{appsScript}</pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(appsScript);
                  setCopiedScript(true);
                  setTimeout(() => setCopiedScript(false), 2000);
                }}
                style={{ position: "absolute", top: 8, right: 8, fontSize: 11, padding: "4px 10px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-secondary)" }}>
                {copiedScript ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
              Luego, en el editor de Apps Script: reloj (Activadores) → Añadir activador → función <strong>onFormSubmit</strong>,
              evento <strong>Al enviarse el formulario</strong>. Guarda y autoriza el acceso.
              Este script no hay que volver a pegarlo si más adelante cambias los campos.
            </p>
          </>
        )}

        <div style={{ display: "flex", marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function arrowStyle(disabled: boolean): React.CSSProperties {
  return {
    background: "transparent", border: "none", padding: 0, lineHeight: 1,
    fontSize: 9, color: disabled ? "var(--border)" : "var(--text-secondary)",
    cursor: disabled ? "default" : "pointer",
  };
}

function OptionsEditor({
  options, draft, setDraft, onAdd, onRemove,
}: {
  options: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: (v: string) => void;
  onRemove: (index: number) => void;
}) {
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Escribe una opción" style={{ fontSize: 13 }} />
        <button className="btn-ghost" onClick={add} style={{ flexShrink: 0 }}>+</button>
      </div>
      {options.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {options.map((o, i) => (
            <span key={`${o}-${i}`} style={{
              fontSize: 12, padding: "3px 8px", borderRadius: 6,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {o}
              <button onClick={() => onRemove(i)}
                style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
