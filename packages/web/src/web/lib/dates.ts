// Formateo de fechas en castellano. Antes cada página tenía su propia copia de
// formatDateES con variaciones sutiles (con/sin año, con/sin capitalizar), lo
// que provocaba formatos distintos en pantallas equivalentes (Q-04).
//
// Todas las funciones esperan la fecha en formato "YYYY-MM-DD" y la interpretan
// al mediodía para que el cambio de zona horaria nunca desplace el día.

function parseISODate(dateStr: string): Date | null {
  const d = new Date(dateStr + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "14 de agosto de 2026" */
export function formatDateES(dateStr: string): string {
  const d = parseISODate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/** "14 ago" */
export function formatDateShortES(dateStr: string): string {
  const d = parseISODate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

/** "Viernes, 14 de agosto" — para cabeceras de día del calendario. */
export function formatWeekdayDateES(dateStr: string): string {
  const d = parseISODate(dateStr);
  if (!d) return dateStr;
  return capitalize(d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }));
}

/** "Viernes, 14 de agosto de 2026" — versión larga con año (partidos, PDFs). */
export function formatFullDateES(dateStr: string): string {
  const d = parseISODate(dateStr);
  if (!d) return dateStr;
  return capitalize(
    d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  );
}

/** "14/08/2026" a partir de "2026-08-14". Devuelve "—" si no hay fecha. */
export function formatDateNumeric(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}
