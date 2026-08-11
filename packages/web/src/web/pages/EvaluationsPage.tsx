import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import Topbar from "../components/Topbar";
import { Icon, PATHS } from "../components/icons";
import { authFetch, authFetchJson } from "../lib/authFetch";
import type { TeamGender } from "../lib/gender";
import { playerWord } from "../lib/gender";
import { AdditionalBadge } from "../components/AdditionalBadge";
import {
  buildEvaluationsCsv,
  categoryOf,
  computeStats,
  EVAL_CATEGORIES,
  parseValue,
  rankPlayers,
  type EvalSession,
  type EvalTest,
  type EvalValue,
  type EvalValueEnriched,
} from "../lib/evaluations";
import { formatDateES, formatDateShortES } from "../lib/dates";

type Player = {
  id: number;
  name: string;
  number: number | null;
  photoData: string | null;
  isAdditional: boolean;
  positions: string;
};

type TeamInfo = {
  id: number;
  name: string;
  gender?: TeamGender;
  role?: "owner" | "editor" | "viewer";
};

type View = "tests" | "record" | "compare";

const VIEW_LABELS: Record<View, string> = {
  tests: "Pruebas",
  record: "Registrar",
  compare: "Comparativa",
};

const CATEGORY_LIST = Object.entries(EVAL_CATEGORIES);

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 6,
  marginTop: 16,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  borderBottom: "1px solid var(--border)",
  color: "var(--text-secondary)",
};

const emptyTestForm = () => ({
  name: "",
  unit: "",
  description: "",
  category: "otro",
  lowerIsBetter: false,
});

export default function EvaluationsPage({ params }: { params?: { teamId?: string } }) {
  const routeParams = useParams<{ teamId: string }>();
  const teamId = Number(params?.teamId || routeParams.teamId);
  const { token } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const [view, setView] = useState<View>("tests");

  const [showTestModal, setShowTestModal] = useState(false);
  const [editTest, setEditTest] = useState<EvalTest | null>(null);
  const [testForm, setTestForm] = useState(emptyTestForm());

  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [compareTestId, setCompareTestId] = useState<number | null>(null);

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: teamData } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => authFetchJson<{ team?: TeamInfo }>(`/api/teams/${teamId}`, {}, token),
    enabled: !!teamId,
  });

  const { data: testsData, isLoading: testsLoading } = useQuery({
    queryKey: ["eval-tests", teamId],
    queryFn: async () =>
      authFetchJson<{ tests: EvalTest[] }>(`/api/evaluations/tests?teamId=${teamId}`, {}, token),
    enabled: !!teamId,
  });

  const { data: sessionsData } = useQuery({
    queryKey: ["eval-sessions", teamId],
    queryFn: async () =>
      authFetchJson<{ sessions: EvalSession[] }>(`/api/evaluations/sessions?teamId=${teamId}`, {}, token),
    enabled: !!teamId,
  });

  const { data: playersData } = useQuery({
    queryKey: ["players", teamId],
    queryFn: () => authFetchJson<{ players: Player[] }>(`/api/players?teamId=${teamId}`, {}, token),
    enabled: !!teamId,
  });

  const tests: EvalTest[] = testsData?.tests ?? [];
  const sessions: EvalSession[] = sessionsData?.sessions ?? [];
  const team = teamData?.team;
  const gender = team?.gender;
  const canEdit = team?.role === "owner" || team?.role === "editor";

  const players: Player[] = useMemo(() => {
    const list: Player[] = playersData?.players ?? [];
    // Se incluyen los jugadores adicionales; se ordena por dorsal y nombre.
    return [...list].sort((a, b) => {
      if (a.number != null && b.number != null && a.number !== b.number) return a.number - b.number;
      if (a.number != null && b.number == null) return -1;
      if (a.number == null && b.number != null) return 1;
      return a.name.localeCompare(b.name, "es");
    });
  }, [playersData]);

  // La jornada seleccionada por defecto es la más reciente.
  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!sessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (tests.length === 0) {
      setCompareTestId(null);
      return;
    }
    if (!tests.some((t) => t.id === compareTestId)) setCompareTestId(tests[0].id);
  }, [tests, compareTestId]);

  const selectedIdx = sessions.findIndex((s) => s.id === selectedSessionId);
  const currentSession = selectedIdx >= 0 ? sessions[selectedIdx] : null;

  const { data: valuesData } = useQuery({
    queryKey: ["eval-values", currentSession?.id],
    queryFn: () =>
      authFetchJson<{ values: EvalValue[] }>(
        `/api/evaluations/values?sessionId=${currentSession!.id}`,
        {},
        token,
      ),
    enabled: !!currentSession,
  });
  const serverValues: EvalValue[] = valuesData?.values ?? [];

  // Historial completo del equipo: comparativa y exportación.
  const { data: historyData } = useQuery({
    queryKey: ["eval-history", teamId],
    queryFn: () =>
      authFetchJson<{ sessions: EvalSession[]; values: EvalValueEnriched[] }>(
        `/api/evaluations/history?teamId=${teamId}`,
        {},
        token,
      ),
    enabled: !!teamId && (view === "compare" || tests.length > 0),
  });

  // ─── Estado local de la tabla + guardado con debounce ───────────────────────
  // Las celdas se editan en local y se envían agrupadas 600 ms después de la
  // última pulsación, en vez de un PUT por tecla.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">(
    "idle",
  );
  const pendingRef = useRef<Record<string, string>>({});
  // Jornada a la que pertenecen los cambios pendientes: evita escribirlos en
  // otra jornada si el usuario cambia de selección antes de que salte el
  // debounce.
  const pendingSessionRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});

  const cellKey = (playerId: number, testId: number) => `${playerId}:${testId}`;

  // Al cambiar de jornada se vuelcan los cambios pendientes de la anterior y se
  // descartan los borradores locales.
  useEffect(() => {
    flushRef.current();
    setDrafts({});
    setSaveState("idle");
  }, [currentSession?.id]);

  useEffect(() => {
    return () => {
      // Al desmontar hay que VOLCAR lo pendiente, no solo cancelar el timer:
      // si escribes un valor y navegas fuera antes de los 600 ms, el dato se
      // perdía en silencio. Ver F-031.
      if (timerRef.current) clearTimeout(timerRef.current);
      flushRef.current();
    };
  }, []);

  const saveValues = useMutation({
    mutationFn: async (payload: {
      sessionId: number;
      values: { playerId: number; testId: number; value: string }[];
    }) => {
      const res = await authFetch(
        "/api/evaluations/values/batch",
        { method: "PUT", body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo guardar");
      return res.json();
    },
    onSuccess: (_data, payload) => {
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["eval-values", payload.sessionId] });
      qc.invalidateQueries({ queryKey: ["eval-tests", teamId] });
      qc.invalidateQueries({ queryKey: ["eval-history", teamId] });
    },
    onError: () => setSaveState("error"),
  });

  function flushPending() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const entries = Object.entries(pendingRef.current);
    const sessionId = pendingSessionRef.current;
    pendingRef.current = {};
    pendingSessionRef.current = null;
    if (entries.length === 0 || !sessionId) return;
    setSaveState("saving");
    saveValues.mutate({
      sessionId,
      values: entries.map(([key, value]) => {
        const [playerId, testId] = key.split(":").map(Number);
        return { playerId, testId, value };
      }),
    });
  }
  flushRef.current = flushPending;

  function onCellChange(playerId: number, testId: number, value: string) {
    if (!currentSession) return;
    // Si quedaban cambios de otra jornada, se envían antes de encolar estos.
    if (pendingSessionRef.current != null && pendingSessionRef.current !== currentSession.id) {
      flushPending();
    }
    const key = cellKey(playerId, testId);
    setDrafts((d) => ({ ...d, [key]: value }));
    pendingRef.current[key] = value;
    pendingSessionRef.current = currentSession.id;
    setSaveState("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushPending, 600);
  }

  function valueFor(playerId: number, testId: number): string {
    const key = cellKey(playerId, testId);
    if (key in drafts) return drafts[key];
    return serverValues.find((v) => v.playerId === playerId && v.testId === testId)?.value ?? "";
  }

  function isPlayerRegistered(playerId: number): boolean {
    return tests.some((t) => valueFor(playerId, t.id).trim() !== "");
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const saveTest = useMutation({
    mutationFn: async (data: ReturnType<typeof emptyTestForm>) => {
      const url = editTest
        ? `/api/evaluations/tests/${editTest.id}`
        : "/api/evaluations/tests";
      const res = await authFetch(
        url,
        { method: editTest ? "PUT" : "POST", body: JSON.stringify({ teamId, ...data }) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo guardar la prueba");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-tests", teamId] });
      setShowTestModal(false);
      setEditTest(null);
      setTestForm(emptyTestForm());
    },
  });

  const deleteTest = useMutation({
    mutationFn: async (id: number) =>
      authFetch(`/api/evaluations/tests/${id}`, { method: "DELETE" }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-tests", teamId] });
      qc.invalidateQueries({ queryKey: ["eval-history", teamId] });
    },
  });

  const createSession = useMutation({
    mutationFn: async (data: { date: string; notes: string }) => {
      const res = await authFetch(
        "/api/evaluations/sessions",
        { method: "POST", body: JSON.stringify({ teamId, ...data }) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo crear la evaluación");
      return res.json();
    },
    onSuccess: async (res) => {
      setShowSessionModal(false);
      setView("record");
      // Se espera al refetch: si no, el efecto que valida la jornada
      // seleccionada aún no ve la nueva y vuelve a la anterior (y los valores
      // acabarían escritos en la jornada equivocada).
      await qc.invalidateQueries({ queryKey: ["eval-sessions", teamId] });
      qc.invalidateQueries({ queryKey: ["eval-history", teamId] });
      if (res?.session?.id) setSelectedSessionId(res.session.id);
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (id: number) =>
      authFetch(`/api/evaluations/sessions/${id}`, { method: "DELETE" }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-sessions", teamId] });
      qc.invalidateQueries({ queryKey: ["eval-tests", teamId] });
      qc.invalidateQueries({ queryKey: ["eval-history", teamId] });
      setSelectedSessionId(null);
    },
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function openNewTest() {
    setEditTest(null);
    setTestForm(emptyTestForm());
    setShowTestModal(true);
  }

  function openEditTest(t: EvalTest) {
    setEditTest(t);
    setTestForm({
      name: t.name,
      unit: t.unit,
      description: t.description,
      category: t.category,
      lowerIsBetter: t.lowerIsBetter,
    });
    setShowTestModal(true);
  }

  function openNewSession() {
    setSessionForm({ date: new Date().toISOString().slice(0, 10), notes: "" });
    setShowSessionModal(true);
  }

  function exportCsv() {
    const csv = buildEvaluationsCsv({
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        number: p.number,
        isAdditional: p.isAdditional,
      })),
      tests,
      sessions: historyData?.sessions ?? sessions,
      values: historyData?.values ?? [],
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valoraciones-${(team?.name ?? "equipo").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pw = (plural: boolean, cap = false) => playerWord(gender, plural, cap);
  const registeredCount = players.filter((p) => isPlayerRegistered(p.id)).length;

  const saveLabel =
    saveState === "pending" || saveState === "saving"
      ? "Guardando…"
      : saveState === "saved"
        ? "Guardado"
        : saveState === "error"
          ? "Error al guardar"
          : "";
  const saveLabelColor =
    saveState === "error"
      ? "var(--danger)"
      : saveState === "saved"
        ? "var(--accent-green)"
        : "var(--text-muted)";

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Topbar
        crumbs={[
          { label: "Equipos", href: "/teams" },
          { label: team?.name ?? "Equipo", href: `/teams/${teamId}/players` },
          { label: "Valoraciones" },
        ]}
        actions={
          <>
            {!isMobile && (
              <div
                style={{
                  display: "flex",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 2,
                }}
              >
                {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      fontSize: 12,
                      fontWeight: view === v ? 700 : 600,
                      padding: "5px 12px",
                      borderRadius: 6,
                      border: "none",
                      background: view === v ? "var(--accent-dim)" : "transparent",
                      color: view === v ? "var(--accent)" : "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    {VIEW_LABELS[v]}
                  </button>
                ))}
              </div>
            )}
            {canEdit && view === "tests" && (
              <button className="btn-accent" onClick={openNewTest}>
                <Icon d={PATHS.plus} size={14} color="#000" strokeWidth={2.2} />
                {!isMobile && " Nueva prueba"}
              </button>
            )}
            {canEdit && view === "record" && (
              <button className="btn-accent" onClick={openNewSession}>
                <Icon d={PATHS.plus} size={14} color="#000" strokeWidth={2.2} />
                {!isMobile && " Nueva evaluación"}
              </button>
            )}
            {view === "compare" && (
              <button className="btn-ghost" onClick={exportCsv}>
                {isMobile ? "CSV" : "Exportar CSV"}
              </button>
            )}
          </>
        }
      />

      <div className="page-body">
        {isMobile && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
            {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 20,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  background: view === v ? "var(--accent)" : "var(--bg-surface)",
                  color: view === v ? "#000" : "var(--text-secondary)",
                }}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        )}

        {/* ═══════════════ VISTA: PRUEBAS ═══════════════ */}
        {view === "tests" && (
          <>
            <p className="section-label" style={{ marginBottom: 14 }}>
              {tests.length} prueba{tests.length !== 1 ? "s" : ""} configurada
              {tests.length !== 1 ? "s" : ""}
            </p>

            {testsLoading ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Cargando…</p>
            ) : tests.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
                  Sin pruebas configuradas
                </p>
                {canEdit && (
                  <button className="btn-accent" onClick={openNewTest}>
                    <Icon d={PATHS.plus} size={14} color="#000" strokeWidth={2.2} /> Crear primera
                    prueba
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {tests.map((t) => {
                  const cat = categoryOf(t.category);
                  return (
                    <div
                      key={t.id}
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: "14px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            flexShrink: 0,
                            background: `${cat.color}18`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: cat.color,
                            fontWeight: 700,
                            fontSize: 11,
                            textAlign: "center",
                            padding: 2,
                          }}
                        >
                          {t.unit || cat.label.slice(0, 3)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {t.name}
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "1px 7px",
                                borderRadius: 10,
                                background: `${cat.color}22`,
                                color: cat.color,
                              }}
                            >
                              {cat.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                            {t.description ||
                              (t.lowerIsBetter ? "Menor es mejor" : "Mayor es mejor")}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "rgba(34,211,238,0.12)",
                            color: "var(--accent)",
                          }}
                        >
                          {t.recordCount ?? 0} registro{(t.recordCount ?? 0) !== 1 ? "s" : ""}
                        </span>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => openEditTest(t)}
                              className="btn-ghost"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `¿Eliminar la prueba "${t.name}"? Los valores ya registrados se conservan en el historial de cada ${pw(false)}.`,
                                  )
                                ) {
                                  deleteTest.mutate(t.id);
                                }
                              }}
                              className="btn-ghost"
                              style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger)" }}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ═══════════════ VISTA: REGISTRAR ═══════════════ */}
        {view === "record" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 18,
                flexWrap: "wrap",
              }}
            >
              {sessions.length > 0 ? (
                <>
                  <button
                    className="btn-ghost"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                    disabled={selectedIdx >= sessions.length - 1}
                    onClick={() => setSelectedSessionId(sessions[selectedIdx + 1]?.id ?? null)}
                  >
                    ←
                  </button>
                  <select
                    value={selectedSessionId ?? ""}
                    onChange={(e) => setSelectedSessionId(Number(e.target.value))}
                    style={{ width: "auto", minWidth: 220, fontWeight: 600 }}
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatDateES(s.date)}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-ghost"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                    disabled={selectedIdx <= 0}
                    onClick={() => setSelectedSessionId(sessions[selectedIdx - 1]?.id ?? null)}
                  >
                    →
                  </button>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {registeredCount} de {players.length} {pw(true)}
                  </span>
                  {saveLabel && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: saveLabelColor }}>
                      {saveLabel}
                    </span>
                  )}
                  {canEdit && currentSession && (
                    <button
                      className="btn-ghost"
                      style={{
                        padding: "5px 10px",
                        fontSize: 12,
                        color: "var(--danger)",
                        marginLeft: "auto",
                      }}
                      onClick={() => {
                        if (confirm("¿Eliminar esta evaluación y todos sus valores?")) {
                          deleteSession.mutate(currentSession.id);
                        }
                      }}
                    >
                      Eliminar evaluación
                    </button>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {canEdit
                    ? "Aún no hay evaluaciones. Crea la primera con «Nueva evaluación»."
                    : "Aún no hay evaluaciones registradas."}
                </p>
              )}
            </div>

            {currentSession && tests.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Primero configura las pruebas físicas en la pestaña «Pruebas».
                </p>
                <button
                  className="btn-ghost"
                  onClick={() => setView("tests")}
                  style={{ marginTop: 12 }}
                >
                  Ir a Pruebas
                </button>
              </div>
            )}

            {currentSession && tests.length > 0 && players.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Este equipo aún no tiene {pw(true)}.
              </p>
            )}

            {currentSession && tests.length > 0 && players.length > 0 && !isMobile && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  overflowX: "auto",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>{pw(true, true)}</th>
                      {tests.map((t) => (
                        <th key={t.id} style={thStyle}>
                          {t.name}
                          {t.unit && (
                            <span
                              style={{
                                color: "var(--text-muted)",
                                fontWeight: 400,
                                marginLeft: 4,
                              }}
                            >
                              ({t.unit})
                            </span>
                          )}
                        </th>
                      ))}
                      <th style={thStyle}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.id}>
                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.number != null ? `#${p.number} ` : ""}
                          {p.name}
                          {p.isAdditional && (
                            <span style={{ marginLeft: 8 }}>
                              <AdditionalBadge compact />
                            </span>
                          )}
                        </td>
                        {tests.map((t) => (
                          <td key={t.id} style={tdStyle}>
                            <input
                              style={{ width: 90, textAlign: "center", padding: "6px 8px" }}
                              type="text"
                              inputMode="decimal"
                              placeholder="—"
                              disabled={!canEdit}
                              value={valueFor(p.id, t.id)}
                              onChange={(e) => onCellChange(p.id, t.id, e.target.value)}
                              onBlur={() => {
                                if (timerRef.current) clearTimeout(timerRef.current);
                                flushPending();
                              }}
                            />
                          </td>
                        ))}
                        <td style={tdStyle}>
                          <StatusBadge registered={isPlayerRegistered(p.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {currentSession && tests.length > 0 && players.length > 0 && isMobile && (
              <div style={{ display: "grid", gap: 8 }}>
                {players.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        {p.number != null ? `#${p.number} ` : ""}
                        {p.name}
                        {p.isAdditional && <AdditionalBadge compact />}
                      </span>
                      <StatusBadge registered={isPlayerRegistered(p.id)} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {tests.map((t) => (
                        <div key={t.id}>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              marginBottom: 4,
                            }}
                          >
                            {t.name}
                            {t.unit ? ` (${t.unit})` : ""}
                          </div>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="—"
                            disabled={!canEdit}
                            value={valueFor(p.id, t.id)}
                            onChange={(e) => onCellChange(p.id, t.id, e.target.value)}
                            onBlur={() => {
                              if (timerRef.current) clearTimeout(timerRef.current);
                              flushPending();
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══════════════ VISTA: COMPARATIVA ═══════════════ */}
        {view === "compare" && (
          <CompareView
            tests={tests}
            players={players}
            sessions={historyData?.sessions ?? []}
            values={historyData?.values ?? []}
            compareTestId={compareTestId}
            onSelectTest={setCompareTestId}
            pw={pw}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* ═══════════════ MODAL: prueba ═══════════════ */}
      {showTestModal && (
        <ModalShell onClose={() => { setShowTestModal(false); setEditTest(null); }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>
                {editTest ? "Editar prueba" : "Nueva prueba física"}
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Define los parámetros de la evaluación
              </p>
            </div>
            <CloseButton onClick={() => { setShowTestModal(false); setEditTest(null); }} />
          </div>

          <label style={labelStyle}>Nombre de la prueba *</label>
          <input
            placeholder="Ej: Velocidad 20 m"
            value={testForm.name}
            onChange={(e) => setTestForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />

          <label style={labelStyle}>Unidad de medida</label>
          <input
            placeholder="Ej: seg, cm, m, kg, ml/kg/min"
            value={testForm.unit}
            onChange={(e) => setTestForm((f) => ({ ...f, unit: e.target.value }))}
          />

          <label style={labelStyle}>Descripción (opcional)</label>
          <input
            placeholder="Instrucciones o detalles de la prueba"
            value={testForm.description}
            onChange={(e) => setTestForm((f) => ({ ...f, description: e.target.value }))}
          />

          <label style={labelStyle}>Categoría</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORY_LIST.map(([key, cat]) => (
              <button
                key={key}
                onClick={() => setTestForm((f) => ({ ...f, category: key }))}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${cat.color}44`,
                  background: testForm.category === key ? `${cat.color}22` : "transparent",
                  color: cat.color,
                  cursor: "pointer",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <label style={labelStyle}>Dirección de mejora</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { v: false, label: "Mayor es mejor", hint: "saltos, cargas, distancias" },
              { v: true, label: "Menor es mejor", hint: "tiempos" },
            ].map((o) => (
              <button
                key={String(o.v)}
                onClick={() => setTestForm((f) => ({ ...f, lowerIsBetter: o.v }))}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: "left",
                  cursor: "pointer",
                  border: `1px solid ${testForm.lowerIsBetter === o.v ? "var(--accent)" : "var(--border)"}`,
                  background:
                    testForm.lowerIsBetter === o.v ? "var(--accent-dim)" : "transparent",
                  color:
                    testForm.lowerIsBetter === o.v ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {o.label}
                <div style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)", marginTop: 2 }}>
                  {o.hint}
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <button
              className="btn-ghost"
              onClick={() => { setShowTestModal(false); setEditTest(null); }}
            >
              Cancelar
            </button>
            <button
              className="btn-accent"
              disabled={!testForm.name.trim() || saveTest.isPending}
              onClick={() => saveTest.mutate(testForm)}
            >
              {editTest ? "Guardar" : "Crear prueba"}
            </button>
          </div>
        </ModalShell>
      )}

      {/* ═══════════════ MODAL: jornada de evaluación ═══════════════ */}
      {showSessionModal && (
        <ModalShell onClose={() => setShowSessionModal(false)}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Nueva evaluación</h2>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Una jornada de tomas para todo el equipo
              </p>
            </div>
            <CloseButton onClick={() => setShowSessionModal(false)} />
          </div>

          <label style={labelStyle}>Fecha *</label>
          <input
            type="date"
            value={sessionForm.date}
            onChange={(e) => setSessionForm((f) => ({ ...f, date: e.target.value }))}
          />

          <label style={labelStyle}>Notas (opcional)</label>
          <input
            placeholder="Ej: test inicial de pretemporada"
            value={sessionForm.notes}
            onChange={(e) => setSessionForm((f) => ({ ...f, notes: e.target.value }))}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={() => setShowSessionModal(false)}>
              Cancelar
            </button>
            <button
              className="btn-accent"
              disabled={!sessionForm.date || createSession.isPending}
              onClick={() => createSession.mutate(sessionForm)}
            >
              Crear evaluación
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function StatusBadge({ registered }: { registered: boolean }) {
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: registered ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)",
        color: registered ? "var(--accent-green)" : "var(--accent-orange)",
      }}
    >
      {registered ? "Registrado" : "Pendiente"}
    </span>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Cerrar"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        width: 32,
        height: 32,
        cursor: "pointer",
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      ✕
    </button>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // `onClose` llega como función inline, así que cambia de identidad en cada
  // render del padre. Se guarda en un ref para que el efecto de abajo pueda
  // tener dependencias vacías: si dependiera de `onClose`, cada pulsación de
  // tecla lo desmontaría y su cleanup devolvería el foco al campo anterior
  // (por eso en "Nueva prueba física" solo se podía escribir una letra en
  // "Unidad de medida" antes de saltar el cursor al campo "Nombre").
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Se captura durante el primer render, no dentro del efecto: al ejecutarse el
  // efecto el `autoFocus` del primer input ya ha movido el foco dentro del
  // modal, así que ahí `document.activeElement` ya no es quien lo abrió.
  const openerRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );

  useEffect(() => {
    const prevFocus = openerRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prevFocus?.focus?.();
    };
  }, []);

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        ref={panelRef}
        className="card fade-in"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 28, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}

function CompareView({
  tests,
  players,
  sessions,
  values,
  compareTestId,
  onSelectTest,
  pw,
  isMobile,
}: {
  tests: EvalTest[];
  players: Player[];
  sessions: EvalSession[];
  values: EvalValue[];
  compareTestId: number | null;
  onSelectTest: (id: number) => void;
  pw: (plural: boolean, cap?: boolean) => string;
  isMobile: boolean;
}) {
  const test = tests.find((t) => t.id === compareTestId) ?? null;

  // Para cada jugador: último valor y anterior de la prueba elegida.
  const rows = useMemo(() => {
    if (!test) return [];
    const byDateDesc = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
    const valueAt = (sessionId: number, playerId: number) =>
      values.find(
        (v) => v.sessionId === sessionId && v.playerId === playerId && v.testId === test.id,
      )?.value ?? null;

    return players.map((p) => {
      const history = byDateDesc
        .map((s) => ({ date: s.date, value: valueAt(s.id, p.id) }))
        .filter((h) => h.value != null && h.value !== "");
      return {
        playerId: p.id,
        player: p,
        value: history[0]?.value ?? null,
        date: history[0]?.date ?? null,
        previous: history[1]?.value ?? null,
        samples: history.length,
      };
    });
  }, [test, players, sessions, values]);

  const ranked = test ? rankPlayers(rows, test.lowerIsBetter) : [];
  const stats = test ? computeStats(rows.map((r) => r.value), test.lowerIsBetter) : null;
  const missing = rows.filter((r) => r.value == null || r.value === "");
  const absNums = ranked.map((r) => Math.abs(r.num));
  const maxNum = absNums.length > 0 ? Math.max(...absNums) : 0;
  const minNum = absNums.length > 0 ? Math.min(...absNums) : 0;
  // La barra representa lo bueno que es el registro, no su magnitud: en las
  // pruebas de tiempo (menor es mejor) se invierte para que la mejor marca sea
  // la barra más larga.
  const barRatio = (n: number) => {
    const a = Math.abs(n);
    if (test?.lowerIsBetter) return a > 0 ? minNum / a : 0;
    return maxNum > 0 ? a / maxNum : 0;
  };

  if (tests.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Configura al menos una prueba para poder comparar.
      </p>
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        {tests.map((t) => {
          const cat = categoryOf(t.category);
          const active = t.id === compareTestId;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTest(t.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${active ? cat.color : "var(--border)"}`,
                background: active ? `${cat.color}22` : "transparent",
                color: active ? cat.color : "var(--text-secondary)",
              }}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      {!test ? null : ranked.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Todavía no hay valores registrados en «{test.name}».
        </p>
      ) : (
        <>
          {stats && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                gap: 10,
                marginBottom: 18,
              }}
            >
              <StatBox label="Mejor" value={`${stats.best}`} unit={test.unit} accent />
              <StatBox label="Media" value={`${stats.avg}`} unit={test.unit} />
              <StatBox label="Peor" value={`${stats.worst}`} unit={test.unit} />
              <StatBox
                label={`${pw(true, true)} con dato`}
                value={`${stats.count}/${players.length}`}
                unit=""
              />
            </div>
          )}

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "8px 4px",
            }}
          >
            {ranked.map((r) => {
              const width = Math.max(barRatio(r.num) * 100, 4);
              const prev = parseValue(r.previous);
              const delta = prev !== null ? Math.round((r.num - prev) * 1000) / 1000 : null;
              const improved =
                delta === null || delta === 0
                  ? null
                  : test.lowerIsBetter
                    ? delta < 0
                    : delta > 0;
              return (
                <div
                  key={r.playerId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 14px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      fontSize: 12,
                      fontWeight: 700,
                      color: r.position === 1 ? "var(--accent)" : "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  >
                    {r.position}
                  </span>
                  <span
                    style={{
                      width: isMobile ? 110 : 190,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {r.player.number != null ? `#${r.player.number} ` : ""}
                    {r.player.name}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.05)",
                      overflow: "hidden",
                      minWidth: 40,
                    }}
                  >
                    <div
                      style={{
                        width: `${width}%`,
                        height: "100%",
                        borderRadius: 4,
                        background: categoryOf(test.category).color,
                        opacity: r.position === 1 ? 1 : 0.55,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      width: 72,
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    {r.num}
                    {test.unit && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 2 }}>
                        {test.unit}
                      </span>
                    )}
                  </span>
                  {!isMobile && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        width: 60,
                        textAlign: "right",
                        flexShrink: 0,
                        color:
                          improved === null
                            ? "var(--text-muted)"
                            : improved
                              ? "var(--accent-green)"
                              : "var(--danger)",
                      }}
                    >
                      {delta === null
                        ? "—"
                        : `${delta > 0 ? "+" : ""}${delta}`}
                    </span>
                  )}
                  {!isMobile && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        width: 60,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {r.date ? formatDateShortES(r.date) : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {missing.length > 0 && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
              Sin dato en esta prueba: {missing.map((m) => m.player.name).join(", ")}
            </p>
          )}
        </>
      )}
    </>
  );
}

function StatBox({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          marginTop: 4,
          color: accent ? "var(--accent)" : "var(--text-primary)",
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginLeft: 3 }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
