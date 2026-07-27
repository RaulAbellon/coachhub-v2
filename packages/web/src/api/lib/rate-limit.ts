// Rate limiter simple en memoria (ventana deslizante) para endpoints públicos
// no autenticados por usuario, como la importación de jugadoras vía Google
// Forms (F-0004 en ai_workflow/01_AUDIT_REPORT.yaml).
//
// Nota: al ser en memoria del proceso, se resetea en cada reinicio del server
// y no se comparte entre instancias si el día de mañana hay más de un
// proceso. Suficiente para el volumen actual (un solo proceso Bun).

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

const hits = new Map<string, number[]>();

export function checkImportRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = timestamps[0];
    hits.set(key, timestamps);
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { allowed: true };
}
