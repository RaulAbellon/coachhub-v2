/**
 * Estilo por tipo de sesión (Dashboard Pro).
 * Sustituye a SESSION_TYPE_META de CalendarPage.
 */
export interface SessionTypeStyle {
  color: string;
  label: string;   // etiqueta corta para badges (ATQ/DEF/TRA/PREP)
  name: string;    // nombre completo
  bg: string;
  badgeClass: string;
}

export const SESSION_TYPE_STYLE: Record<string, SessionTypeStyle> = {
  ataque:      { color: "#f97316", label: "ATQ",  name: "Ataque",      bg: "rgba(249,115,22,0.1)", badgeClass: "badge badge-orange" },
  defensa:     { color: "#3b82f6", label: "DEF",  name: "Defensa",     bg: "rgba(59,130,246,0.1)", badgeClass: "badge badge-blue" },
  transicion:  { color: "#22c55e", label: "TRA",  name: "Transición",  bg: "rgba(34,197,94,0.1)",  badgeClass: "badge badge-green" },
  preparacion: { color: "#a855f7", label: "PREP", name: "Preparación", bg: "rgba(168,85,247,0.1)", badgeClass: "badge badge-purple" },
};

/**
 * Opciones canónicas para selectores de tipo de sesión (formularios).
 * Fuente única: antes estaba duplicado en SessionPage y NewSessionPage con
 * colores distintos para "ataque" (#f97316 vs #22d3ee).
 */
export const SESSION_TYPE_OPTIONS = [
  { value: "ataque",      label: "Ataque",                 color: SESSION_TYPE_STYLE.ataque!.color },
  { value: "defensa",     label: "Defensa",                color: SESSION_TYPE_STYLE.defensa!.color },
  { value: "transicion",  label: "Transición",             color: SESSION_TYPE_STYLE.transicion!.color },
  { value: "preparacion", label: "Preparación de partido", color: SESSION_TYPE_STYLE.preparacion!.color },
];

export function sessionStyle(type: string | undefined | null): SessionTypeStyle {
  return SESSION_TYPE_STYLE[type ?? ""] ?? SESSION_TYPE_STYLE.ataque!;
}

export const MATCH_COLOR = "#fbbf24";

/** Convierte hex (#rrggbb) a rgba con alpha. Tolera valores no-hex. */
export function hexToRgba(hex: string, alpha: number) {
  if (!hex?.startsWith("#") || hex.length < 7) return `rgba(34,211,238,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Iniciales de un nombre de equipo: "Sénior Femenino" → "SF" */
export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const MONTHS_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/** "2026-08-04" → "04 AGO" */
export function shortDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return `${String(d).padStart(2, "0")} ${MONTHS_SHORT[m - 1]}`;
}

/** Etiqueta relativa para próximos eventos: HOY / MAÑANA / 17 AGO */
export function relativeTag(dateStr: string, today = new Date()) {
  const t = today.toLocaleDateString("en-CA");
  const tomorrowDate = new Date(today);
  tomorrowDate.setDate(today.getDate() + 1);
  const tomorrow = tomorrowDate.toLocaleDateString("en-CA");
  if (dateStr === t) return "HOY";
  if (dateStr === tomorrow) return "MAÑANA";
  return shortDate(dateStr);
}
