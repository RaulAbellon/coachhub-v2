/**
 * Utilidades de microciclos (MC).
 *
 * Un microciclo es una semana ISO (lunes → domingo). En el backend cada sesión
 * guarda su número de microciclo relativo al equipo (`sessions.microcycle`:
 * MC 1 = semana de la primera sesión de ese equipo).
 *
 * En vistas globales (calendario y dashboard, con varios equipos a la vez) los
 * microciclos se listan como las semanas del mes visible. La etiqueta que se
 * muestra se toma del dato real de las sesiones de esa semana para que coincida
 * con los badges "MC n" del resto de la app; si esa semana no tiene sesiones se
 * extrapola a partir de la semana conocida más cercana y, si el mes está vacío,
 * se numeran 1..N.
 */

export interface MicrocycleWeek {
  /** Fecha (YYYY-MM-DD) del lunes de la semana. */
  monday: string;
  /** Las 7 fechas de la semana, de lunes a domingo. */
  dates: string[];
  /** Número que se muestra al usuario ("MC {label}"). */
  label: number;
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

/**
 * Microciclos (semanas) que toca el mes `month` (0-11) de `year`.
 *
 * @param dated sesiones del mes con su fecha y su número de microciclo real.
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

  // Número de MC más frecuente por semana, según las sesiones existentes.
  const votes = new Map<string, Map<number, number>>();
  for (const item of dated) {
    const mc = item.microcycle;
    if (!mc || !Number.isFinite(mc)) continue;
    const monday = getMonday(item.date);
    if (!seen.has(monday)) continue;
    const perWeek = votes.get(monday) ?? new Map<number, number>();
    perWeek.set(mc, (perWeek.get(mc) ?? 0) + 1);
    votes.set(monday, perWeek);
  }

  const known: (number | undefined)[] = mondays.map((monday) => {
    const perWeek = votes.get(monday);
    if (!perWeek) return undefined;
    let best: number | undefined;
    let bestCount = -1;
    for (const [mc, count] of perWeek) {
      // Empate → el número más bajo, para que sea estable entre renders.
      if (count > bestCount || (count === bestCount && best !== undefined && mc < best)) {
        best = mc;
        bestCount = count;
      }
    }
    return best;
  });

  const anchorIdx = known.findIndex((v) => v !== undefined);

  return mondays.map((monday, idx) => {
    let label: number;
    if (known[idx] !== undefined) {
      label = known[idx]!;
    } else if (anchorIdx >= 0) {
      label = Math.max(1, known[anchorIdx]! + (idx - anchorIdx));
    } else {
      label = idx + 1;
    }
    return { monday, dates: getWeekDates(monday), label };
  });
}

/** Índice del microciclo que contiene `dateStr`, o -1 si no está en la lista. */
export function findMicrocycleIndex(weeks: MicrocycleWeek[], dateStr: string): number {
  const monday = getMonday(dateStr);
  return weeks.findIndex((w) => w.monday === monday);
}
