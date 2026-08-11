// Rate limiter simple en memoria (ventana deslizante) para endpoints públicos
// no autenticados por usuario: la importación de jugadoras vía Google Forms
// (F-0004) y el login/registro (S-01 de la auditoría del 11/08/2026).
//
// Nota: al ser en memoria del proceso, se resetea en cada reinicio del server
// y no se comparte entre instancias si el día de mañana hay más de un
// proceso. Suficiente para el volumen actual (un solo proceso Bun).

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

interface Bucket {
  windowMs: number;
  max: number;
  hits: Map<string, number[]>;
}

// Importación desde Google Forms: 10 peticiones por minuto y token de equipo.
const IMPORT: Bucket = { windowMs: 60_000, max: 10, hits: new Map() };

// Login / registro: 10 intentos fallidos cada 15 minutos por IP. En el login
// solo se cuentan los fallos (un acierto no consume cuota), así que un usuario
// legítimo nunca se queda fuera aunque comparta IP con otros.
const AUTH: Bucket = { windowMs: 15 * 60_000, max: 10, hits: new Map() };

// Evita que los Map crezcan sin límite: cada cierto número de comprobaciones se
// purgan las claves cuyos timestamps ya están todos fuera de la ventana
// (antes, una IP distinta por petición dejaba una entrada residual para siempre).
const PURGE_EVERY_CALLS = 100;
const callsSincePurge = new Map<Bucket, number>();

function purgeExpired(bucket: Bucket, now: number) {
  for (const [key, timestamps] of bucket.hits) {
    const fresh = timestamps.filter((t) => now - t < bucket.windowMs);
    if (fresh.length === 0) bucket.hits.delete(key);
    else if (fresh.length !== timestamps.length) bucket.hits.set(key, fresh);
  }
}

function check(bucket: Bucket, key: string): RateLimitResult {
  const now = Date.now();
  const calls = (callsSincePurge.get(bucket) ?? 0) + 1;
  if (calls >= PURGE_EVERY_CALLS) {
    callsSincePurge.set(bucket, 0);
    purgeExpired(bucket, now);
  } else {
    callsSincePurge.set(bucket, calls);
  }

  const timestamps = (bucket.hits.get(key) ?? []).filter((t) => now - t < bucket.windowMs);

  if (timestamps.length >= bucket.max) {
    const oldest = timestamps[0];
    bucket.hits.set(key, timestamps);
    return { allowed: false, retryAfterMs: bucket.windowMs - (now - oldest) };
  }

  timestamps.push(now);
  bucket.hits.set(key, timestamps);
  return { allowed: true };
}

/** Cuota de la importación pública de fichas (clave: token del equipo). */
export function checkImportRateLimit(key: string): RateLimitResult {
  return check(IMPORT, key);
}

/**
 * ¿Puede esta IP seguir intentando autenticarse? No consume cuota: solo
 * consulta. Se llama ANTES de comprobar la contraseña.
 */
export function checkAuthRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const timestamps = (AUTH.hits.get(key) ?? []).filter((t) => now - t < AUTH.windowMs);
  if (timestamps.length >= AUTH.max) {
    return { allowed: false, retryAfterMs: AUTH.windowMs - (now - timestamps[0]) };
  }
  return { allowed: true };
}

/** Registra un intento fallido de login/registro para esa IP. */
export function recordAuthFailure(key: string): void {
  check(AUTH, key);
}

/** Limpia la cuota de una IP tras un login correcto. */
export function clearAuthFailures(key: string): void {
  AUTH.hits.delete(key);
}

/** Solo para tests: vacía todos los contadores. */
export function __resetRateLimits(): void {
  IMPORT.hits.clear();
  AUTH.hits.clear();
  callsSincePurge.clear();
}
