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
