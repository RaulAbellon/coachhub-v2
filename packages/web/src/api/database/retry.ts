/**
 * Reintentos automáticos para las consultas a Turso.
 *
 * Turso (libSQL sobre HTTP) cierra las conexiones inactivas. Cuando el proceso
 * lleva horas/días levantado, la primera consulta tras el corte fallaba con
 * `ECONNRESET` / "The socket connection was closed unexpectedly" y la API
 * devolvía un 500 (p. ej. el login). Estos errores son transitorios: basta con
 * reintentar y el cliente abre una conexión nueva.
 */

export const MAX_ATTEMPTS = 4; // 1 intento + 3 reintentos
export const BASE_DELAY_MS = 100;

/** Códigos de error de red/servidor que merecen un reintento. */
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

/** Mensajes (en minúsculas) que identifican cortes de conexión transitorios. */
const RETRYABLE_MESSAGES = [
  "socket connection was closed",
  "econnreset",
  "socket hang up",
  "connection closed",
  "connection reset",
  "stream closed",
  "fetch failed",
  "network error",
  "other side closed",
  "terminated",
  "timeout",
  "temporarily unavailable",
  "service unavailable",
  "too many requests",
  "server error",
  "bad gateway",
  "gateway timeout",
  "hrana",
  "stream not found",
  "baton",
];

/** Errores de SQL/lógica que NUNCA deben reintentarse. */
const NON_RETRYABLE_MESSAGES = [
  "unique constraint",
  "foreign key constraint",
  "not null constraint",
  "check constraint",
  "syntax error",
  "no such table",
  "no such column",
  "unauthorized",
  "authentication",
  "invalid token",
  "forbidden",
  "not authorized",
];

function collect(error: unknown, out: unknown[] = [], depth = 0): unknown[] {
  if (error == null || depth > 5 || out.includes(error)) return out;
  out.push(error);
  if (typeof error === "object") {
    const e = error as { cause?: unknown; errors?: unknown };
    collect(e.cause, out, depth + 1);
    if (Array.isArray(e.errors)) {
      for (const inner of e.errors) collect(inner, out, depth + 1);
    }
  }
  return out;
}

/**
 * ¿El error es un fallo transitorio de conexión con la base de datos?
 * Recorre también `cause`/`errors` porque Drizzle envuelve el error original
 * en un `DrizzleQueryError`.
 */
export function isRetryableDbError(error: unknown): boolean {
  const chain = collect(error);
  const texts: string[] = [];

  for (const item of chain) {
    if (typeof item === "string") {
      texts.push(item.toLowerCase());
      continue;
    }
    if (typeof item !== "object") continue;
    const e = item as { code?: unknown; errno?: unknown; message?: unknown; status?: unknown };
    if (typeof e.code === "string" && RETRYABLE_CODES.has(e.code.toUpperCase())) return true;
    if (typeof e.status === "number" && (e.status === 429 || e.status >= 500)) return true;
    if (typeof e.message === "string") texts.push(e.message.toLowerCase());
  }

  if (texts.some((t) => NON_RETRYABLE_MESSAGES.some((m) => t.includes(m)))) return false;
  return texts.some((t) => RETRYABLE_MESSAGES.some((m) => t.includes(m)));
}

/** Espera con backoff exponencial + jitter para el intento indicado (0-based). */
export function backoffDelay(attempt: number, base = BASE_DELAY_MS): number {
  const exp = base * 2 ** attempt;
  return Math.round(exp + Math.random() * base);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  /** Sólo para tests: sustituye la espera real. */
  wait?: (ms: number) => Promise<void>;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown; label: string }) => void;
}

/**
 * Ejecuta `fn` reintentando los fallos transitorios de conexión.
 * Los errores de SQL (constraints, sintaxis…) se propagan al primer intento.
 */
export async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? MAX_ATTEMPTS);
  const base = options.baseDelayMs ?? BASE_DELAY_MS;
  const wait = options.wait ?? sleep;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const last = attempt === attempts - 1;
      if (last || !isRetryableDbError(error)) throw error;
      const delayMs = backoffDelay(attempt, base);
      const report =
        options.onRetry ??
        (({ attempt: a, delayMs: d, error: err, label: l }) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[db] ${l} falló (intento ${a + 1}/${attempts}), reintentando en ${d}ms: ${msg}`);
        });
      report({ attempt, delayMs, error, label });
      await wait(delayMs);
    }
  }
  throw lastError;
}

/** Métodos del cliente libSQL que se pueden reintentar sin efectos raros. */
export const RETRYABLE_CLIENT_METHODS = new Set([
  "execute",
  "batch",
  "executeMultiple",
  "migrate",
  "sync",
]);

/**
 * Envuelve un cliente libSQL para que sus operaciones reintenten los cortes de
 * conexión. Las transacciones interactivas (`transaction`) pasan sin envolver:
 * reintentarlas desde aquí no sería seguro.
 */
export function withRetryingClient<T extends object>(client: T, options: RetryOptions = {}): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string") return value;
      if (!RETRYABLE_CLIENT_METHODS.has(prop)) return value.bind(target);
      return (...args: unknown[]) =>
        withDbRetry(
          prop,
          () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args),
          options,
        );
    },
  });
}
