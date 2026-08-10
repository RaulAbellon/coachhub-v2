// Wrapper de fetch compartido para peticiones autenticadas desde el frontend.
// Antes estaba duplicado en SessionPage.tsx, PlayersPage.tsx, TeamsPage.tsx y
// ProfilePage.tsx (F-0008 en ai_workflow/01_AUDIT_REPORT.yaml).
//
// La sesión viaja principalmente en una cookie HttpOnly (ver F-0003): el
// navegador la adjunta automáticamente en same-origin sin necesitar JS. El
// parámetro `token` se mantiene como fallback opcional (p.ej. justo tras el
// login, antes de un refresh) para no romper llamadas existentes.
export function authFetch(url: string, options: RequestInit = {}, token?: string | null) {
  return fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

/**
 * `authFetch` + comprobación de `res.ok` + `.json()`.
 *
 * Las queries hacían `(await authFetch(...)).json()` a pelo: si el servidor
 * respondía 401/403/500, el `.json()` tenía éxito (devolvía `{error: "..."}`),
 * TanStack Query lo daba por bueno y la pantalla se quedaba vacía sin ninguna
 * explicación, o petaba más tarde al leer una propiedad inexistente. Ver F-009.
 */
export async function authFetchJson<T = unknown>(
  url: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const res = await authFetch(url, options, token);
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // respuesta sin cuerpo JSON: nos quedamos con el código de estado
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
