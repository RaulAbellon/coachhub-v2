import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const SESSION_COOKIE = "coachhub_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

// Formato legado (pre-bcrypt): sha256(password + "coachhub_salt").
// Se mantiene solo para poder detectar y migrar hashes antiguos en el
// siguiente login exitoso (ver F-0001 en ai_workflow/01_AUDIT_REPORT.yaml).
export function legacySha256Hash(password: string): string {
  return createHash("sha256").update(password + "coachhub_salt").digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function isLegacyHash(hash: string): boolean {
  // Los hashes bcrypt siempre empiezan por $2a$/$2b$/$2y$; sha256 es hex de 64 chars.
  return !hash.startsWith("$2");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (isLegacyHash(storedHash)) {
    return legacySha256Hash(password) === storedHash;
  }
  return bcrypt.compare(password, storedHash);
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function setSessionCookie(c: any, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

// Persistencia de tokens en DB (sobrevive reinicios del servidor)
export async function getUserFromToken(token: string) {
  if (!token) return null;
  const [row] = await db
    .select({ userId: schema.authTokens.userId, username: schema.users.username, displayName: schema.users.displayName })
    .from(schema.authTokens)
    .innerJoin(schema.users, eq(schema.authTokens.userId, schema.users.id))
    .where(eq(schema.authTokens.token, token));
  return row ? { userId: row.userId, username: row.username, displayName: row.displayName } : null;
}

function tokenFromRequest(c: any): string | null {
  const fromCookie = getCookie(c, SESSION_COOKIE);
  if (fromCookie) return fromCookie;
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export const auth = new Hono()
  .post("/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    const { username, password, displayName } = body;
    if (!username || !password) return c.json({ error: "username y password requeridos" }, 400);

    const existing = await db.select().from(schema.users).where(eq(schema.users.username, username));
    if (existing.length > 0) return c.json({ error: "Usuario ya existe" }, 409);

    const [user] = await db.insert(schema.users).values({
      username: username.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      displayName: displayName?.trim() || username,
    }).returning();

    const token = generateToken();
    await db.insert(schema.authTokens).values({ token, userId: user.id });
    setSessionCookie(c, token);
    return c.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName } }, 201);
  })
  .post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    const { username, password } = body;
    if (!username || !password) return c.json({ error: "username y password requeridos" }, 400);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username.trim().toLowerCase()));
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: "Credenciales incorrectas" }, 401);
    }

    // Migración transparente: si el hash almacenado es el formato legado
    // sha256+salt estático, se re-hashea con bcrypt ahora que sabemos la
    // contraseña en texto plano es correcta.
    if (isLegacyHash(user.passwordHash)) {
      const upgraded = await hashPassword(password);
      await db.update(schema.users).set({ passwordHash: upgraded }).where(eq(schema.users.id, user.id));
    }

    const token = generateToken();
    await db.insert(schema.authTokens).values({ token, userId: user.id });
    setSessionCookie(c, token);
    return c.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName } }, 200);
  })
  .post("/logout", async (c) => {
    const token = tokenFromRequest(c);
    if (token) await db.delete(schema.authTokens).where(eq(schema.authTokens.token, token));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  })
  .get("/me", async (c) => {
    const token = tokenFromRequest(c);
    if (!token) return c.json({ error: "No autorizado" }, 401);
    const session = await getUserFromToken(token);
    if (!session) return c.json({ error: "Token inválido" }, 401);
    return c.json({ user: session });
  });
