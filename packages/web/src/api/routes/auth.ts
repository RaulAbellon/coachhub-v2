import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, gt } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { sendEmail, passwordResetEmailHtml, welcomeEmailHtml } from "../services/email";

const VALID_ROLES = ["entrenador", "analista", "preparador_fisico", "oficial", "delegado", "otro"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

function baseUrlFromRequest(c: any): string {
  const origin = c.req.header("origin");
  if (origin) return origin.replace(/\/$/, "");
  const proto = c.req.header("x-forwarded-proto") || "https";
  const host = c.req.header("host") || "localhost";
  return `${proto}://${host}`;
}

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
    const { username, password, email, firstName, lastName, birthDate, role } = body;

    if (!username || !password) return c.json({ error: "Usuario y contraseña son obligatorios" }, 400);
    if (typeof password !== "string" || password.length < 6) {
      return c.json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
    }
    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return c.json({ error: "Introduce un correo electrónico válido" }, 400);
    }
    if (!firstName?.trim() || !lastName?.trim()) {
      return c.json({ error: "Nombre y apellidos son obligatorios" }, 400);
    }
    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return c.json({ error: "Introduce una fecha de nacimiento válida" }, 400);
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return c.json({ error: "Selecciona un rol válido" }, 400);
    }

    const uname = username.trim().toLowerCase();
    const mail = String(email).trim().toLowerCase();

    const existingUser = await db.select().from(schema.users).where(eq(schema.users.username, uname));
    if (existingUser.length > 0) return c.json({ error: "Ese nombre de usuario ya está en uso" }, 409);
    const existingMail = await db.select().from(schema.users).where(eq(schema.users.email, mail));
    if (existingMail.length > 0) return c.json({ error: "Ese correo ya está registrado" }, 409);

    const fName = firstName.trim();
    const lName = lastName.trim();

    const [user] = await db.insert(schema.users).values({
      username: uname,
      passwordHash: await hashPassword(password),
      displayName: `${fName} ${lName}`.trim(),
      email: mail,
      firstName: fName,
      lastName: lName,
      birthDate,
      role,
    }).returning();

    const token = generateToken();
    await db.insert(schema.authTokens).values({ token, userId: user.id });
    setSessionCookie(c, token);

    // Correo de bienvenida (informativo). No bloquea el registro: si el envío
    // falla, la cuenta ya está creada y la sesión iniciada igualmente.
    sendEmail({
      to: mail,
      subject: "¡Bienvenido a CoachHub!",
      html: welcomeEmailHtml(user.displayName || ""),
    }).catch((err) => {
      console.error("[register] no se pudo enviar el correo de bienvenida:", err);
    });

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
  })
  .post("/change-password", async (c) => {
    const token = tokenFromRequest(c);
    if (!token) return c.json({ error: "No autorizado" }, 401);
    const session = await getUserFromToken(token);
    if (!session) return c.json({ error: "Token inválido" }, 401);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return c.json({ error: "Contraseña actual y nueva requeridas" }, 400);
    }
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return c.json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId));
    if (!user) return c.json({ error: "Usuario no encontrado" }, 404);

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return c.json({ error: "La contraseña actual no es correcta" }, 401);
    }

    await db.update(schema.users)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(eq(schema.users.id, user.id));

    // Cierra el resto de sesiones por seguridad, dejando activa solo la actual.
    const allTokens = await db.select().from(schema.authTokens).where(eq(schema.authTokens.userId, user.id));
    for (const t of allTokens) {
      if (t.token !== token) {
        await db.delete(schema.authTokens).where(eq(schema.authTokens.token, t.token));
      }
    }

    return c.json({ ok: true });
  })
  .post("/forgot-password", async (c) => {
    const body = await c.req.json().catch(() => null);
    const email = body?.email ? String(body.email).trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email)) {
      return c.json({ error: "Introduce un correo electrónico válido" }, 400);
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));

    // Respuesta uniforme aunque el email no exista, para no revelar qué correos
    // están registrados (evita enumeración de cuentas).
    if (user) {
      // Invalida tokens de reseteo previos de este usuario.
      await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, user.id));
      const resetToken = generateToken();
      await db.insert(schema.passwordResetTokens).values({
        token: resetToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });
      const resetUrl = `${baseUrlFromRequest(c)}/reset-password?token=${resetToken}`;
      try {
        await sendEmail({
          to: user.email,
          subject: "Restablece tu contraseña de CoachHub",
          html: passwordResetEmailHtml(user.displayName, resetUrl),
          text: `Restablece tu contraseña de CoachHub abriendo este enlace (caduca en 1 hora): ${resetUrl}`,
        });
      } catch (err) {
        console.error("Error enviando email de recuperación:", err);
        return c.json({ error: "No se pudo enviar el correo. Inténtalo más tarde." }, 502);
      }
    }

    return c.json({ ok: true });
  })
  .post("/reset-password", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    const { token: resetToken, newPassword } = body;
    if (!resetToken || !newPassword) {
      return c.json({ error: "Token y nueva contraseña requeridos" }, 400);
    }
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return c.json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);
    }

    const [row] = await db.select().from(schema.passwordResetTokens)
      .where(and(
        eq(schema.passwordResetTokens.token, resetToken),
        gt(schema.passwordResetTokens.expiresAt, new Date()),
      ));
    if (!row) return c.json({ error: "El enlace no es válido o ha caducado" }, 400);

    await db.update(schema.users)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(eq(schema.users.id, row.userId));

    // Consume el token y cierra todas las sesiones activas del usuario.
    await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, row.userId));
    await db.delete(schema.authTokens).where(eq(schema.authTokens.userId, row.userId));

    return c.json({ ok: true });
  });
