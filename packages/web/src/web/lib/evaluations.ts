// Lógica pura de valoraciones físicas: tendencias, formato y exportación.
// Vive fuera del componente para poder testearla sin DOM (los tests corren en
// entorno node, sin jsdom).

export type EvalTest = {
  id: number;
  teamId: number;
  name: string;
  unit: string;
  description: string;
  category: string;
  lowerIsBetter: boolean;
  /** Si tiene valor, el ejercicio es puntual de esa jornada (no del catálogo). */
  sessionId?: number | null;
  sortOrder: number;
  recordCount?: number;
};

export type EvalSession = {
  id: number;
  teamId: number;
  title?: string;
  date: string; // YYYY-MM-DD
  notes: string;
  /** Ejercicios incluidos en la jornada (los devuelve GET /sessions). */
  tests?: EvalTest[];
};

/** Etiqueta de una jornada: título si lo tiene, si no la fecha con las notas. */
export function sessionLabel(
  s: Pick<EvalSession, "title" | "date" | "notes">,
  formatDate: (d: string) => string,
): string {
  const title = (s.title ?? "").trim();
  if (title) return `${title} · ${formatDate(s.date)}`;
  return s.notes.trim() ? `${formatDate(s.date)} · ${s.notes.trim()}` : formatDate(s.date);
}

export type EvalValue = {
  id: number;
  sessionId: number;
  playerId: number;
  testId: number;
  value: string;
};

export type EvalValueEnriched = EvalValue & {
  test: EvalTest | null;
  session: Pick<EvalSession, "id" | "date" | "notes"> | null;
};

export const EVAL_CATEGORIES: Record<string, { label: string; color: string }> = {
  velocidad: { label: "Velocidad", color: "#22d3ee" },
  fuerza: { label: "Fuerza", color: "#a855f7" },
  resistencia: { label: "Resistencia", color: "#22c55e" },
  agilidad: { label: "Agilidad", color: "#f97316" },
  flexibilidad: { label: "Flexibilidad", color: "#ec4899" },
  otro: { label: "Otro", color: "#a1a1aa" },
};

export function categoryOf(category: string | undefined | null) {
  return EVAL_CATEGORIES[category ?? "otro"] ?? EVAL_CATEGORIES.otro;
}

/** Convierte el texto de una celda a número. Acepta coma decimal ("4,52"). */
export function parseValue(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const clean = String(raw).trim().replace(",", ".");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export type Trend = {
  /** Diferencia bruta último - anterior. */
  diff: number;
  /** true si el cambio es una mejora según la dirección de la prueba. */
  improved: boolean;
  /** true si no hay cambio. */
  flat: boolean;
  /** Flecha a mostrar: refleja el movimiento real del número. */
  arrow: "↑" | "↓" | "—";
  /** Texto ya formateado, p.ej. "-0.12". */
  label: string;
};

/**
 * Compara el último valor con el anterior teniendo en cuenta si en esa prueba
 * un número menor es mejor (tiempos) o mayor es mejor (saltos, cargas).
 */
export function computeTrend(
  latest: string | null | undefined,
  previous: string | null | undefined,
  lowerIsBetter: boolean,
): Trend | null {
  const a = parseValue(latest);
  const b = parseValue(previous);
  if (a === null || b === null) return null;

  const diff = Math.round((a - b) * 1000) / 1000;
  const flat = diff === 0;
  const improved = flat ? false : lowerIsBetter ? diff < 0 : diff > 0;
  const arrow: Trend["arrow"] = flat ? "—" : diff > 0 ? "↑" : "↓";
  const label = flat ? "0" : `${diff > 0 ? "+" : ""}${diff}`;

  return { diff, improved, flat, arrow, label };
}

/** Color de la tendencia según el tema de la app. */
export function trendColor(trend: Trend | null): string {
  if (!trend || trend.flat) return "var(--text-muted)";
  return trend.improved ? "var(--accent-green)" : "var(--danger)";
}

/** Estadísticas de una prueba dentro de una jornada (para la comparativa). */
export type TestStats = {
  count: number;
  min: number;
  max: number;
  avg: number;
  best: number;
  worst: number;
};

export function computeStats(values: (string | null | undefined)[], lowerIsBetter: boolean): TestStats | null {
  const nums = values.map(parseValue).filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const avg = Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
  return {
    count: nums.length,
    min,
    max,
    avg,
    best: lowerIsBetter ? min : max,
    worst: lowerIsBetter ? max : min,
  };
}

/**
 * Ranking de una prueba: mejor primero según la dirección de la prueba.
 * Los jugadores sin valor quedan fuera.
 */
export function rankPlayers<T extends { playerId: number }>(
  rows: (T & { value: string | null | undefined })[],
  lowerIsBetter: boolean,
): (T & { num: number; position: number })[] {
  const withNums = rows
    .map((r) => ({ ...r, num: parseValue(r.value) }))
    .filter((r): r is T & { value: string | null | undefined; num: number } => r.num !== null);
  withNums.sort((a, b) => (lowerIsBetter ? a.num - b.num : b.num - a.num));
  return withNums.map((r, i) => ({ ...r, position: i + 1 }));
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV con separador `;` (el que espera Excel en configuración regional
 * española) y BOM para que las tildes se vean bien al abrirlo.
 */
export function buildEvaluationsCsv(input: {
  players: { id: number; name: string; number: number | null; isAdditional: boolean }[];
  tests: EvalTest[];
  sessions: EvalSession[];
  values: EvalValue[];
}): string {
  const { players, tests, sessions, values } = input;
  const byKey = new Map<string, string>();
  for (const v of values) byKey.set(`${v.sessionId}:${v.playerId}:${v.testId}`, v.value);

  const header = ["Fecha", "Dorsal", "Jugador", "Adicional", ...tests.map((t) => (t.unit ? `${t.name} (${t.unit})` : t.name))];
  const lines: string[] = [header.map(csvCell).join(";")];

  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of ordered) {
    for (const p of players) {
      const cells = tests.map((t) => byKey.get(`${s.id}:${p.id}:${t.id}`) ?? "");
      // No exportar filas completamente vacías.
      if (cells.every((c) => c === "")) continue;
      lines.push(
        [s.date, p.number ?? "", p.name, p.isAdditional ? "Sí" : "", ...cells].map(csvCell).join(";"),
      );
    }
  }

  return "﻿" + lines.join("\n");
}
