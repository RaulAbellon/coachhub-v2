/**
 * Reglas del porcentaje de asistencia.
 *
 * El porcentaje mide la asistencia REAL: solo cuentan las sesiones a las que la
 * jugadora podía ir. Las ausencias justificadas y las lesiones quedan fuera del
 * cálculo (ni suman ni restan), así que:
 *
 *   % = presentes / (presentes + ausencias sin justificar)
 *
 * Si no queda ninguna sesión computable (todo justificado o lesión) el
 * porcentaje es `null` y en pantalla se muestra un guion.
 */

/** Estados que entran en el cálculo del porcentaje. */
export const ATTENDANCE_COUNTED = ["present", "absent"] as const;

/** ¿Este estado entra en el porcentaje? (justificada y lesionada, no). */
export function countsForAttendance(status: string): boolean {
  return status === "present" || status === "absent";
}

/** Porcentaje entero (0-100) o null si no hay sesiones computables. */
export function attendancePct(present: number, counted: number): number | null {
  return counted > 0 ? Math.round((present / counted) * 100) : null;
}

/** Porcentaje con un decimal (0-100) o null si no hay sesiones computables. */
export function attendancePct1(present: number, counted: number): number | null {
  return counted > 0 ? Math.round((present / counted) * 1000) / 10 : null;
}
