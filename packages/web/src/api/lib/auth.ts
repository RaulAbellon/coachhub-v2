import { getCookie } from "hono/cookie";
import { getUserFromToken } from "../routes/auth";

export const SESSION_COOKIE = "coachhub_session";

/**
 * Resolves the bearer token for a request. Prefers the HttpOnly session
 * cookie (set by /api/auth/login|register); falls back to the
 * `Authorization: Bearer <token>` header for non-browser/mobile clients
 * that cannot rely on a cookie jar.
 */
export function getTokenFromRequest(c: any): string | null {
  const fromCookie = getCookie(c, SESSION_COOKIE);
  if (fromCookie) return fromCookie;
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export async function requireAuth(c: any) {
  const token = getTokenFromRequest(c);
  if (!token) return null;
  return getUserFromToken(token);
}
