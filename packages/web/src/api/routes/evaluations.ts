import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, desc, asc, isNull, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

// Categorías admitidas para una prueba física. Cualquier otro valor cae a "otro".
const CATEGORIES = new Set([
  "velocidad",
  "fuerza",
  "resistencia",
  "agilidad",
  "flexibilidad",
  "otro",
]);

function normalizeCategory(v: unknown): string {
  return typeof v === "string" && CATEGORIES.has(v) ? v : "otro";
}

function isValidDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

async function getMembership(userId: number, teamId: number) {
  const [m] = await db
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)));
  return m ?? null;
}

function canWrite(m: { role: string } | null): boolean {
  return m?.role === "owner" || m?.role === "editor";
}

export const evaluations = new Hono()
  // ── TESTS (pruebas físicas configurables por equipo) ───────────────────────

  .get("/tests", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.query("teamId") ?? "0");
    if (!teamId) return c.json({ error: "teamId requerido" }, 400);

    const membership = await getMembership(user.userId, teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const active = await db
      .select()
      .from(schema.evaluationTests)
      .where(
        and(
          eq(schema.evaluationTests.teamId, teamId),
          isNull(schema.evaluationTests.deletedAt),
        ),
      )
      .orderBy(asc(schema.evaluationTests.sortOrder), asc(schema.evaluationTests.id));

    // Nº de valores registrados por prueba (para el badge de la tarjeta).
    const counts: Record<number, number> = {};
    if (active.length > 0) {
      const vals = await db
        .select({ testId: schema.evaluationValues.testId })
        .from(schema.evaluationValues)
        .where(inArray(schema.evaluationValues.testId, active.map((t) => t.id)));
      for (const v of vals) counts[v.testId] = (counts[v.testId] ?? 0) + 1;
    }

    return c.json({
      tests: active.map((t) => ({ ...t, recordCount: counts[t.id] ?? 0 })),
      role: membership.role,
    });
  })

  .post("/tests", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const teamId = parseInt(String(body.teamId ?? 0));
    if (!teamId) return c.json({ error: "teamId requerido" }, 400);

    const membership = await getMembership(user.userId, teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    const name = String(body.name ?? "").trim();
    if (!name) return c.json({ error: "El nombre de la prueba es obligatorio" }, 400);

    // sortOrder = último + 1, contando también las borradas para no reciclar posiciones.
    const existing = await db
      .select({ sortOrder: schema.evaluationTests.sortOrder })
      .from(schema.evaluationTests)
      .where(eq(schema.evaluationTests.teamId, teamId));
    const maxSort = existing.reduce((mx, e) => Math.max(mx, e.sortOrder), 0);

    const [created] = await db
      .insert(schema.evaluationTests)
      .values({
        teamId,
        name,
        unit: String(body.unit ?? "").trim(),
        description: String(body.description ?? "").trim(),
        category: normalizeCategory(body.category),
        lowerIsBetter: Boolean(body.lowerIsBetter),
        sortOrder: maxSort + 1,
      })
      .returning();

    return c.json({ test: created });
  })

  .put("/tests/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const testId = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const [existing] = await db
      .select()
      .from(schema.evaluationTests)
      .where(eq(schema.evaluationTests.id, testId));
    if (!existing || existing.deletedAt) return c.json({ error: "Prueba no encontrada" }, 404);

    const membership = await getMembership(user.userId, existing.teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    const name = body.name === undefined ? existing.name : String(body.name).trim();
    if (!name) return c.json({ error: "El nombre de la prueba es obligatorio" }, 400);

    await db
      .update(schema.evaluationTests)
      .set({
        name,
        unit: body.unit === undefined ? existing.unit : String(body.unit).trim(),
        description:
          body.description === undefined ? existing.description : String(body.description).trim(),
        category: body.category === undefined ? existing.category : normalizeCategory(body.category),
        lowerIsBetter:
          body.lowerIsBetter === undefined ? existing.lowerIsBetter : Boolean(body.lowerIsBetter),
        sortOrder:
          body.sortOrder === undefined ? existing.sortOrder : parseInt(String(body.sortOrder)) || 0,
        updatedAt: new Date(),
      })
      .where(eq(schema.evaluationTests.id, testId));

    return c.json({ ok: true });
  })

  .delete("/tests/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const testId = parseInt(c.req.param("id"));

    const [existing] = await db
      .select()
      .from(schema.evaluationTests)
      .where(eq(schema.evaluationTests.id, testId));
    if (!existing || existing.deletedAt) return c.json({ error: "Prueba no encontrada" }, 404);

    const membership = await getMembership(user.userId, existing.teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    // Soft-delete: los valores históricos siguen accesibles en la ficha del jugador.
    await db
      .update(schema.evaluationTests)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.evaluationTests.id, testId));

    return c.json({ ok: true });
  })

  // ── SESSIONS (jornadas de evaluación) ─────────────────────────────────────

  .get("/sessions", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.query("teamId") ?? "0");
    if (!teamId) return c.json({ error: "teamId requerido" }, 400);

    const membership = await getMembership(user.userId, teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const sessions = await db
      .select()
      .from(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.teamId, teamId))
      .orderBy(desc(schema.evaluationSessions.date), desc(schema.evaluationSessions.id));

    return c.json({ sessions });
  })

  .post("/sessions", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const teamId = parseInt(String(body.teamId ?? 0));
    if (!teamId) return c.json({ error: "teamId requerido" }, 400);

    const membership = await getMembership(user.userId, teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    const date = isValidDate(body.date) ? body.date : new Date().toISOString().slice(0, 10);

    const [created] = await db
      .insert(schema.evaluationSessions)
      .values({ teamId, date, notes: String(body.notes ?? "").trim() })
      .returning();

    return c.json({ session: created });
  })

  .put("/sessions/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const sessionId = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const [existing] = await db
      .select()
      .from(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.id, sessionId));
    if (!existing) return c.json({ error: "Evaluación no encontrada" }, 404);

    const membership = await getMembership(user.userId, existing.teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    await db
      .update(schema.evaluationSessions)
      .set({
        date: isValidDate(body.date) ? body.date : existing.date,
        notes: body.notes === undefined ? existing.notes : String(body.notes).trim(),
      })
      .where(eq(schema.evaluationSessions.id, sessionId));

    return c.json({ ok: true });
  })

  .delete("/sessions/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const sessionId = parseInt(c.req.param("id"));

    const [existing] = await db
      .select()
      .from(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.id, sessionId));
    if (!existing) return c.json({ error: "Evaluación no encontrada" }, 404);

    const membership = await getMembership(user.userId, existing.teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    // Los valores primero (FK), después la jornada.
    await db
      .delete(schema.evaluationValues)
      .where(eq(schema.evaluationValues.sessionId, sessionId));
    await db
      .delete(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.id, sessionId));

    return c.json({ ok: true });
  })

  // ── VALUES ────────────────────────────────────────────────────────────────

  // Historial completo del equipo: todos los valores de todas las jornadas.
  // Se usa para la comparativa entre jugadores y para exportar a CSV.
  .get("/history", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.query("teamId") ?? "0");
    if (!teamId) return c.json({ error: "teamId requerido" }, 400);

    const membership = await getMembership(user.userId, teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const sessions = await db
      .select()
      .from(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.teamId, teamId))
      .orderBy(desc(schema.evaluationSessions.date));

    if (sessions.length === 0) return c.json({ sessions: [], values: [] });

    const values = await db
      .select()
      .from(schema.evaluationValues)
      .where(inArray(schema.evaluationValues.sessionId, sessions.map((s) => s.id)));

    return c.json({ sessions, values });
  })

  .get("/values", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const sessionId = parseInt(c.req.query("sessionId") ?? "0");
    const playerIdRaw = c.req.query("playerId");

    // ── Historial individual de un jugador (pestaña "Evaluaciones" de la ficha)
    if (playerIdRaw) {
      const playerId = parseInt(playerIdRaw);
      if (!playerId) return c.json({ error: "playerId inválido" }, 400);

      // El teamId se deriva del propio jugador; no se confía en el query param
      // para evitar que alguien lea datos de un equipo ajeno (IDOR).
      const [player] = await db
        .select()
        .from(schema.players)
        .where(eq(schema.players.id, playerId));
      if (!player) return c.json({ error: "Jugador no encontrado" }, 404);

      const membership = await getMembership(user.userId, player.teamId);
      if (!membership) return c.json({ error: "Sin acceso" }, 403);

      const values = await db
        .select()
        .from(schema.evaluationValues)
        .where(eq(schema.evaluationValues.playerId, playerId));

      const testIds = [...new Set(values.map((v) => v.testId))];
      const sessionIds = [...new Set(values.map((v) => v.sessionId))];
      const testsMap: Record<number, typeof schema.evaluationTests.$inferSelect> = {};
      const sessionsMap: Record<number, typeof schema.evaluationSessions.$inferSelect> = {};

      if (testIds.length > 0) {
        const tests = await db
          .select()
          .from(schema.evaluationTests)
          .where(inArray(schema.evaluationTests.id, testIds));
        for (const t of tests) testsMap[t.id] = t;
      }
      if (sessionIds.length > 0) {
        const sess = await db
          .select()
          .from(schema.evaluationSessions)
          .where(inArray(schema.evaluationSessions.id, sessionIds));
        for (const s of sess) sessionsMap[s.id] = s;
      }

      const enriched = values.map((v) => ({
        ...v,
        test: testsMap[v.testId] ?? null,
        session: sessionsMap[v.sessionId] ?? null,
      }));
      // Más recientes primero, por fecha real de la jornada.
      enriched.sort((a, b) => (b.session?.date ?? "").localeCompare(a.session?.date ?? ""));

      return c.json({ values: enriched });
    }

    // ── Valores de una jornada concreta (tabla de registro)
    if (!sessionId) return c.json({ error: "sessionId o playerId requerido" }, 400);

    const [session] = await db
      .select()
      .from(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.id, sessionId));
    if (!session) return c.json({ error: "Evaluación no encontrada" }, 404);

    const membership = await getMembership(user.userId, session.teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const values = await db
      .select()
      .from(schema.evaluationValues)
      .where(eq(schema.evaluationValues.sessionId, sessionId));

    return c.json({ values });
  })

  .put("/values/batch", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const sessionId = parseInt(String(body.sessionId ?? 0));
    const incoming = Array.isArray(body.values) ? body.values : [];
    if (!sessionId) return c.json({ error: "sessionId requerido" }, 400);

    const [session] = await db
      .select()
      .from(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.id, sessionId));
    if (!session) return c.json({ error: "Evaluación no encontrada" }, 404);

    const membership = await getMembership(user.userId, session.teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    // Solo se aceptan jugadores y pruebas que pertenezcan al mismo equipo que
    // la jornada; así un valor no puede colarse en un equipo ajeno.
    const teamPlayers = await db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(eq(schema.players.teamId, session.teamId));
    const teamTests = await db
      .select({ id: schema.evaluationTests.id })
      .from(schema.evaluationTests)
      .where(eq(schema.evaluationTests.teamId, session.teamId));
    const validPlayers = new Set(teamPlayers.map((p) => p.id));
    const validTests = new Set(teamTests.map((t) => t.id));

    let saved = 0;
    let cleared = 0;
    for (const raw of incoming) {
      const playerId = parseInt(String(raw?.playerId ?? 0));
      const testId = parseInt(String(raw?.testId ?? 0));
      if (!validPlayers.has(playerId) || !validTests.has(testId)) continue;
      const value = String(raw?.value ?? "").trim();

      // Vaciar el input borra el registro: así el jugador no queda marcado
      // como "registrado" con una celda en blanco.
      if (value === "") {
        await db
          .delete(schema.evaluationValues)
          .where(
            and(
              eq(schema.evaluationValues.sessionId, sessionId),
              eq(schema.evaluationValues.playerId, playerId),
              eq(schema.evaluationValues.testId, testId),
            ),
          );
        cleared++;
        continue;
      }

      await db
        .insert(schema.evaluationValues)
        .values({ sessionId, playerId, testId, value })
        .onConflictDoUpdate({
          target: [
            schema.evaluationValues.sessionId,
            schema.evaluationValues.playerId,
            schema.evaluationValues.testId,
          ],
          set: { value, updatedAt: new Date() },
        });
      saved++;
    }

    return c.json({ ok: true, saved, cleared });
  });
