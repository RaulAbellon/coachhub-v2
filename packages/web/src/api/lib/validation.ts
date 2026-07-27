// Helpers de validación compartidos entre rutas de la API.
// Ver F-0006 (límite de tamaño para campos base64) y F-0016 (JSON body inválido)
// en ai_workflow/01_AUDIT_REPORT.yaml.

/** ~1MB decodificado ≈ 1.37MB en base64. Suficiente para un PDF/foto razonable. */
export const MAX_BASE64_FIELD_BYTES = 1_400_000;

export class PayloadTooLargeError extends Error {
  constructor(public field: string) {
    super(`El campo '${field}' supera el tamaño máximo permitido`);
  }
}

/**
 * Lanza PayloadTooLargeError si alguno de los campos indicados excede
 * MAX_BASE64_FIELD_BYTES caracteres (aproximación razonable del tamaño en
 * bytes, ya que base64 es ASCII).
 */
export function assertBase64FieldsWithinLimit(body: Record<string, any>, fields: string[]) {
  for (const field of fields) {
    const value = body?.[field];
    if (typeof value === "string" && value.length > MAX_BASE64_FIELD_BYTES) {
      throw new PayloadTooLargeError(field);
    }
  }
}

/** Parsea el body como JSON devolviendo null si no es JSON válido, en vez de lanzar. */
export async function safeJson(c: any): Promise<any | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}
