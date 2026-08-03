import { db } from "../database";
import * as schema from "../database/schema";
import { and, eq, isNull } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de campo soportados
// ─────────────────────────────────────────────────────────────────────────────
export const FIELD_TYPES = [
  "text",        // texto corto
  "number",      // número
  "date",        // fecha
  "paragraph",   // texto largo
  "select",      // una sola opción (desplegable)
  "multiselect", // varias opciones (casillas)
  "boolean",     // sí / no
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto corto",
  number: "Número",
  date: "Fecha",
  paragraph: "Párrafo",
  select: "Una opción",
  multiselect: "Varias opciones",
  boolean: "Sí / No",
};

// ─────────────────────────────────────────────────────────────────────────────
// Campos por defecto (builtin). El `key` NUNCA cambia: es lo que conecta
// Google Form → import → ficha → PDF. `mapsToColumn` apunta a la columna real
// de la tabla `players`.
// `locked: true` → no se puede desactivar ni eliminar (clave de cruce).
// ─────────────────────────────────────────────────────────────────────────────
export type BuiltinField = {
  key: string;
  label: string;
  type: FieldType;
  mapsToColumn: string;
  options?: string[];
  locked?: boolean;
};

export const BUILTIN_FIELDS: BuiltinField[] = [
  { key: "nombre", label: "Nombre y apellidos", type: "text", mapsToColumn: "name", locked: true },
  { key: "dorsal", label: "Dorsal", type: "number", mapsToColumn: "number" },
  { key: "fecha_nac", label: "Fecha de nacimiento", type: "date", mapsToColumn: "birthDate" },
  {
    key: "posicion",
    label: "Posición",
    type: "multiselect",
    mapsToColumn: "positions",
    options: ["Portera", "Extremo izquierdo", "Lateral izquierdo", "Central", "Lateral derecho", "Extremo derecho", "Pivote"],
  },
  { key: "altura", label: "Altura (cm)", type: "number", mapsToColumn: "height" },
  { key: "peso", label: "Peso (kg)", type: "number", mapsToColumn: "weight" },
  { key: "envergadura", label: "Envergadura (cm)", type: "number", mapsToColumn: "wingspan" },
  { key: "enfermedades", label: "Enfermedades crónicas", type: "paragraph", mapsToColumn: "chronicDiseases" },
  { key: "lesiones", label: "Lesiones previas", type: "paragraph", mapsToColumn: "previousInjuries" },
  { key: "alergias", label: "Alergias / Intolerancias", type: "paragraph", mapsToColumn: "allergies" },
  { key: "notas", label: "Notas adicionales", type: "paragraph", mapsToColumn: "notes" },
];

export const LOCKED_KEYS = BUILTIN_FIELDS.filter(f => f.locked).map(f => f.key);

export const BUILTIN_BY_KEY = new Map(BUILTIN_FIELDS.map(f => [f.key, f]));

/** Columnas nativas de `players` que un campo builtin puede rellenar. */
export const NATIVE_COLUMNS = new Set(BUILTIN_FIELDS.map(f => f.mapsToColumn));

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de etiquetas: el mapeo Google Form → campo se hace comparando
// la etiqueta normalizada (sin acentos, sin mayúsculas, sin paréntesis ni
// signos). Así el entrenador puede escribir "Peso (kg)" o "peso" y funciona.
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeLabel(raw: string): string {
  return (raw ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "") // quita acentos
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")      // quita "(cm)", "(kg)"...
    .replace(/[^a-z0-9]+/g, " ")     // resto de signos → espacio
    .trim()
    .replace(/\s+/g, "_");
}

/** Genera un slug estable para un campo personalizado nuevo. */
export function slugifyKey(label: string): string {
  const base = normalizeLabel(label).slice(0, 40) || "campo";
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed lazy: si el equipo no tiene configuración de campos todavía, se crean
// los builtins. Idempotente: sirve tanto para equipos nuevos como antiguos.
// ─────────────────────────────────────────────────────────────────────────────
export async function ensureTeamFormFields(teamId: number) {
  const existing = await db.select().from(schema.teamFormFields)
    .where(eq(schema.teamFormFields.teamId, teamId));

  if (existing.length > 0) return existing;

  await db.insert(schema.teamFormFields).values(
    BUILTIN_FIELDS.map((f, i) => ({
      teamId,
      key: f.key,
      label: f.label,
      formLabel: f.label,
      type: f.type,
      options: f.options ? JSON.stringify(f.options) : "",
      enabled: true,
      sortOrder: i * 10,
      isBuiltin: true,
      mapsToColumn: f.mapsToColumn,
    })),
  );

  return db.select().from(schema.teamFormFields)
    .where(eq(schema.teamFormFields.teamId, teamId));
}

/** Campos activos (no eliminados, enabled) del equipo, ordenados. */
export async function getActiveFields(teamId: number) {
  const all = await ensureTeamFormFields(teamId);
  return all
    .filter(f => f.deletedAt === null && f.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Todos los campos vivos (incluye desactivados), ordenados. */
export async function getLiveFields(teamId: number) {
  const all = await ensureTeamFormFields(teamId);
  return all
    .filter(f => f.deletedAt === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function parseOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Coerción / validación de valores según el tipo del campo.
// Devuelve { ok, value } — `value` siempre string para player_custom_values.
// ─────────────────────────────────────────────────────────────────────────────
export function coerceValue(
  type: string,
  options: string[],
  raw: unknown,
  /** lenient: en la importación aceptamos opciones no listadas en vez de fallar */
  lenient = false,
): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: "" };

  const asText = Array.isArray(raw) ? raw.join(", ") : String(raw).trim();
  if (asText === "") return { ok: true, value: "" };

  switch (type) {
    case "number": {
      const n = Number(asText.replace(",", "."));
      if (!Number.isFinite(n)) return { ok: false, error: "Debe ser un número" };
      return { ok: true, value: String(n) };
    }
    case "date": {
      const d = normalizeDateString(asText);
      if (!d) return { ok: false, error: "Fecha no válida" };
      return { ok: true, value: d };
    }
    case "boolean": {
      const t = asText.toLowerCase();
      const yes = ["true", "1", "si", "sí", "yes", "y", "s"].includes(t);
      const no = ["false", "0", "no", "n"].includes(t);
      if (!yes && !no) return { ok: false, error: "Debe ser Sí o No" };
      return { ok: true, value: yes ? "true" : "false" };
    }
    case "select": {
      if (!lenient && options.length > 0 && !options.some(o => normalizeLabel(o) === normalizeLabel(asText))) {
        return { ok: false, error: `Valor no permitido: ${asText}` };
      }
      const match = options.find(o => normalizeLabel(o) === normalizeLabel(asText));
      return { ok: true, value: match ?? asText };
    }
    case "multiselect": {
      const parts = (Array.isArray(raw) ? raw.map(String) : asText.split(","))
        .map(s => s.trim())
        .filter(Boolean);
      const mapped: string[] = [];
      for (const p of parts) {
        const match = options.find(o => normalizeLabel(o) === normalizeLabel(p));
        if (!match && !lenient && options.length > 0) return { ok: false, error: `Valor no permitido: ${p}` };
        mapped.push(match ?? p);
      }
      return { ok: true, value: JSON.stringify(mapped) };
    }
    default:
      return { ok: true, value: asText };
  }
}

export function normalizeDateString(v: unknown): string | null {
  if (!v) return null;
  const s = v.toString().trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/**
 * Convierte el valor coercionado a lo que espera la columna nativa de
 * `players` (números como number, positions como JSON array, etc.).
 */
export function toNativeColumnValue(column: string, type: string, value: string): unknown {
  if (value === "") {
    if (["number", "height", "weight", "wingspan"].includes(column)) return null;
    if (column === "birthDate") return null;
    if (column === "positions") return "";
    return "";
  }
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  if (column === "positions") {
    // ya viene como JSON array desde coerceValue(multiselect)
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch { /* no era JSON */ }
    return JSON.stringify(value.split(",").map(s => s.trim()).filter(Boolean));
  }
  if (type === "boolean") return value === "true" ? "Sí" : "No";
  return value;
}

/** Cuenta cuántos jugadores tienen valor guardado en un campo personalizado. */
export async function countFieldValues(fieldId: number) {
  const rows = await db.select().from(schema.playerCustomValues)
    .where(eq(schema.playerCustomValues.fieldId, fieldId));
  return rows.filter(r => r.value !== "").length;
}

/** Valores personalizados de un jugador, indexados por fieldId. */
export async function getCustomValuesMap(playerId: number) {
  const rows = await db.select().from(schema.playerCustomValues)
    .where(eq(schema.playerCustomValues.playerId, playerId));
  const map = new Map<number, string>();
  for (const r of rows) map.set(r.fieldId, r.value);
  return map;
}

/** Upsert de un valor personalizado. */
export async function upsertCustomValue(playerId: number, fieldId: number, value: string) {
  const [existing] = await db.select().from(schema.playerCustomValues)
    .where(and(
      eq(schema.playerCustomValues.playerId, playerId),
      eq(schema.playerCustomValues.fieldId, fieldId),
    ));

  if (existing) {
    await db.update(schema.playerCustomValues)
      .set({ value, updatedAt: new Date() })
      .where(eq(schema.playerCustomValues.id, existing.id));
    return;
  }

  await db.insert(schema.playerCustomValues).values({ playerId, fieldId, value });
}

/** Campos vivos de un equipo con sus opciones ya parseadas. */
export async function getLiveFieldsHydrated(teamId: number) {
  const fields = await getLiveFields(teamId);
  return fields.map(f => ({ ...f, optionsList: parseOptions(f.options) }));
}

export { isNull };
