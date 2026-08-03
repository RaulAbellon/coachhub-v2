// Utilidades compartidas de los campos configurables de la ficha del jugador.

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "paragraph"
  | "select"
  | "multiselect"
  | "boolean";

export type FormField = {
  id: number;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  enabled: boolean;
  sortOrder: number;
  isBuiltin: boolean;
  mapsToColumn: string | null;
  locked?: boolean;
};

export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Texto corto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "paragraph", label: "Párrafo" },
  { value: "select", label: "Una opción" },
  { value: "multiselect", label: "Varias opciones" },
  { value: "boolean", label: "Sí / No" },
];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Texto corto",
  number: "Número",
  date: "Fecha",
  paragraph: "Párrafo",
  select: "Una opción",
  multiselect: "Varias opciones",
  boolean: "Sí / No",
};

/** Cómo debe crearse esa pregunta en Google Forms. */
export const GOOGLE_FORM_HINT: Record<FieldType, string> = {
  text: "respuesta corta",
  number: "respuesta corta (número)",
  date: "fecha",
  paragraph: "párrafo",
  select: "desplegable o varias opciones (una sola respuesta)",
  multiselect: "casillas (una o varias respuestas)",
  boolean: "desplegable con Sí / No",
};

export const NEEDS_OPTIONS: FieldType[] = ["select", "multiselect"];

/**
 * Apps Script para el Google Form. Manda TODAS las respuestas tal cual; el
 * mapeo respuesta → campo lo hace el servidor comparando la etiqueta, así que
 * el script no hay que regenerarlo al cambiar la configuración de campos.
 */
export function buildAppsScript(importUrl: string): string {
  return `function onFormSubmit(e) {
  var IMPORT_URL = "${importUrl || "PEGA_AQUI_LA_URL_DE_IMPORTACION"}";

  // Manda todas las respuestas del formulario. CoachHub las asocia a los
  // campos de la ficha por el título de cada pregunta.
  var respuestas = {};
  var nv = e.namedValues; // { "Pregunta": ["respuesta"] }
  for (var pregunta in nv) {
    var v = nv[pregunta];
    respuestas[pregunta] = (v && v.join) ? v.join(", ") : String(v);
  }

  UrlFetchApp.fetch(IMPORT_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ responses: respuestas }),
    muteHttpExceptions: true,
  });
}`;
}

/** Formatea un valor de campo para mostrarlo en la ficha o en el PDF. */
export function formatFieldValue(field: { type: FieldType }, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "boolean") {
    const s = String(value).toLowerCase();
    if (s === "true" || s === "sí" || s === "si" || s === "1") return "Sí";
    if (s === "false" || s === "no" || s === "0") return "No";
    return String(value);
  }
  if (field.type === "multiselect") {
    const raw = String(value);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.join(", ");
    } catch { /* no era JSON */ }
    return raw;
  }
  if (field.type === "date") {
    const s = String(value);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return s;
  }
  return String(value);
}
