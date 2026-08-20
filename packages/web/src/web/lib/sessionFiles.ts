// Helpers para los archivos que se adjuntan a una sesión (pista y físico).
// Hasta ahora solo se admitía PDF; ahora también fotos (una foto de la pizarra,
// del cuaderno, etc.). Se guardan en el mismo campo `pdfData` como data URL,
// así que el tipo se deduce del propio data URL.

export type SessionFileKind = "pdf" | "image" | "none";

/** Tipos aceptados por los <input type="file"> de sesiones. */
export const SESSION_FILE_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/gif";

/** Imágenes que el navegador sabe pintar. HEIC/HEIF quedan fuera a propósito. */
const SUPPORTED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Lado máximo (px) al que se reescalan las fotos antes de guardarlas. */
export const MAX_IMAGE_SIDE = 2000;

/** Calidad JPEG del reescalado. */
export const IMAGE_QUALITY = 0.82;

export function sessionFileKind(dataUrl?: string | null): SessionFileKind {
  if (!dataUrl) return "none";
  if (dataUrl.startsWith("data:image/")) return "image";
  if (dataUrl.startsWith("data:application/pdf")) return "pdf";
  // Compatibilidad: sesiones antiguas guardadas sin prefijo reconocible = PDF.
  return "pdf";
}

export function isImageFile(file: { type?: string; name?: string }): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || "");
}

export function isHeicFile(file: { type?: string; name?: string }): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return /\.(heic|heif)$/i.test(file.name || "");
}

/**
 * Valida un archivo elegido por el usuario. Devuelve null si es válido o el
 * mensaje de error a mostrar.
 */
export function validateSessionFile(file: { type?: string; name?: string }): string | null {
  const type = (file.type || "").toLowerCase();
  if (type === "application/pdf" || /\.pdf$/i.test(file.name || "")) return null;
  if (isHeicFile(file)) {
    return "Las fotos HEIC del iPhone no se ven en el navegador. En el móvil: Ajustes → Cámara → Formatos → «Más compatible», o comparte la foto como JPG.";
  }
  if (SUPPORTED_IMAGE_MIME.includes(type)) return null;
  if (isImageFile(file)) return null;
  return "Solo se admiten archivos PDF o fotos (JPG, PNG, WEBP)";
}

/** Etiqueta corta del adjunto, para textos de la interfaz. */
export function sessionFileLabel(dataUrl?: string | null): string {
  const kind = sessionFileKind(dataUrl);
  if (kind === "image") return "foto";
  if (kind === "pdf") return "PDF";
  return "archivo";
}

/** Calcula el tamaño destino de una foto respetando MAX_IMAGE_SIDE. */
export function scaledSize(width: number, height: number, maxSide = MAX_IMAGE_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) return { width, height };
  const ratio = maxSide / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se ha podido leer el archivo"));
    reader.readAsDataURL(file);
  });
}

/**
 * Devuelve el data URL listo para guardar. Los PDF se guardan tal cual; las
 * fotos se reescalan a MAX_IMAGE_SIDE y se recomprimen a JPEG para no reventar
 * el límite de 4MB del backend (una foto de móvil son 5-8MB en base64).
 */
export async function readSessionFile(file: File): Promise<string> {
  if (!isImageFile(file)) return readAsDataUrl(file);
  const original = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("imagen no legible"));
      el.src = original;
    });
    const { width, height } = scaledSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
    return out.length < original.length ? out : original;
  } catch {
    return original;
  }
}
