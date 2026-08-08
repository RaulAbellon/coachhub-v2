/**
 * Utilidades de microciclos (MC).
 *
 * Un microciclo es una semana ISO (lunes → domingo) CON al menos una sesión.
 * La numeración vive en el backend (`sessions.microcycle`) y es:
 *   - continua: no se reinicia entre meses ni entre temporadas,
 *   - por equipo: MC 1 = semana de la primera sesión de ESE equipo,
 *   - densa: una semana sin sesiones no consume número.
 *
 * El frontend NO inventa números: lee el MC real de las sesiones de cada
 * semana. Las semanas sin sesiones se muestran sin número (con su rango de
 * fechas). En las vistas globales (calendario y dashboard, con varios equipos
 * a la vez) una semana puede tener varios números a la vez, uno por equipo:
 * en ese caso se muestran todos ("MC 2 · 5").
 */

export interface MicrocycleWeek {
  /** Fecha (YYYY-MM-DD) del lunes de la semana. */
  monday: string;
  /** Las 7 fechas de la semana, de lunes a domingo. */
  dates: string[];
  /** Números de MC presentes esa semana (uno por equipo), ordenados. Vacío si no hay sesiones. */
  mcNumbers: number[];
  /** Texto listo para mostrar ("MC 4", "MC 2 · 5") o null si la semana no tiene sesiones. */
  label: string | null;
}

/** Devuelve la fecha (YYYY-MM-DD) del lunes de la semana ISO de `dateStr`. */
export function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

/** Genera las 7 fechas (lunes → domingo) de la semana que empieza en `mondayStr`. */
export function getWeekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayStr + "T12:00:00");
    d.setDate(d.getDate() + i);
    return toISODate(d);
  });
}

/** Date → "YYYY-MM-DD" en hora local (sin sustos de zona horaria). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Rango corto de la semana para las semanas sin MC: "1–7 ago", "29 sep–5 oct". */
export function weekRangeLabel(mondayStr: string): string {
  const dates = getWeekDates(mondayStr);
  const [, m1, d1] = dates[0].split("-").map(Number);
  const [, m2, d2] = dates[6].split("-").map(Number);
  const from = m1 === m2 ? `${d1}` : `${d1} ${MONTHS_SHORT[m1 - 1]}`;
  return `${from}–${d2} ${MONTHS_SHORT[m2 - 1]}`;
}

/**
 * Microciclos (semanas) que toca el mes `month` (0-11) de `year`, con el número
 * real de MC leído de las sesiones. No se extrapola ni se numera por posición:
 * una semana sin sesiones se queda sin número (`label: null`).
 *
 * @param dated sesiones del mes con su fecha y su número de microciclo.
 */
export function monthMicrocycles(
  year: number,
  month: number,
  dated: { date: string; microcycle?: number | null }[] = [],
): MicrocycleWeek[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondays: string[] = [];
  const seen = new Set<string>();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const monday = getMonday(dateStr);
    if (!seen.has(monday)) {
      seen.add(monday);
      mondays.push(monday);
    }
  }

  // Números de MC reales presentes en cada semana.
  const byWeek = new Map<string, Set<number>>();
  for (const item of dated) {
    const mc = item.microcycle;
    if (typeof mc !== "number" || !Number.isFinite(mc)) continue;
    const monday = getMonday(item.date);
    if (!seen.has(monday)) continue;
    const set = byWeek.get(monday) ?? new Set<number>();
    set.add(mc);
    byWeek.set(monday, set);
  }

  return mondays.map((monday) => {
    const mcNumbers = [...(byWeek.get(monday) ?? [])].sort((a, b) => a - b);
    return {
      monday,
      dates: getWeekDates(monday),
      mcNumbers,
      label: mcNumbers.length ? `MC ${mcNumbers.join(" · ")}` : null,
    };
  });
}

/** Texto de la semana: su MC si lo tiene, si no el rango de fechas. */
export function weekLabel(week: MicrocycleWeek): string {
  return week.label ?? weekRangeLabel(week.monday);
}

/** Índice del microciclo que contiene `dateStr`, o -1 si no está en la lista. */
export function findMicrocycleIndex(weeks: MicrocycleWeek[], dateStr: string): number {
  const monday = getMonday(dateStr);
  return weeks.findIndex((w) => w.monday === monday);
}
