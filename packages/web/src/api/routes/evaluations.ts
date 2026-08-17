import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, desc, asc, isNull, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { canWrite, getMembership } from "../lib/team";

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

/** Añade un ejercicio a una jornada. Idempotente: si ya estaba, no duplica. */
async function linkTestToSession(sessionId: number, testId: number) {
  const existing = await db
    .select({ testId: schema.evaluationSessionTests.testId })
    .from(schema.evaluationSessionTests)
    .where(eq(schema.evaluationSessionTests.sessionId, sessionId));
  if (existing.some((e) => e.testId === testId)) return;
  await db
    .insert(schema.evaluationSessionTests)
    .values({ sessionId, testId, sortOrder: existing.length })
    .onConflictDoNothing();
}

/**
 * Ejercicios de cada jornada, en orden.
 *
 * Compatibilidad: las jornadas creadas antes de esta función no tienen enlaces;
 * en ese caso se devuelven todas las pruebas activas del catálogo del equipo,
 * que es exactamente lo que la pantalla mostraba antes.
 */
async function testsBySession(teamId: number, sessionIds: number[]) {
  const result: Record<number, (typeof schema.evaluationTests.$inferSelect)[]> = {};
  if (sessionIds.length === 0) return result;

  const catalog = await db
    .select()
    .from(schema.evaluationTests)
    .where(
      and(
        eq(schema.evaluationTests.teamId, teamId),
        isNull(schema.evaluationTests.deletedAt),
        isNull(schema.evaluationTests.sessionId),
      ),
    )
    .orderBy(asc(schema.evaluationTests.sortOrder), asc(schema.evaluationTests.id));

  const links = await db
    .select()
    .from(schema.evaluationSessionTests)
    .where(inArray(schema.evaluationSessionTests.sessionId, sessionIds))
    .orderBy(asc(schema.evaluationSessionTests.sortOrder), asc(schema.evaluationSessionTests.id));

  const linkedTestIds = [...new Set(links.map((l) => l.testId))];
  const testsById: Record<number, typeof schema.evaluationTests.$inferSelect> = {};
  if (linkedTestIds.length > 0) {
    const linkedTests = await db
      .select()
      .from(schema.evaluationTests)
      .where(inArray(schema.evaluationTests.id, linkedTestIds));
    for (const t of linkedTests) {
      if (t.teamId === teamId && !t.deletedAt) testsById[t.id] = t;
    }
  }

  const hasLinks = new Set(links.map((l) => l.sessionId));
  for (const sid of sessionIds) result[sid] = hasLinks.has(sid) ? [] : [...catalog];
  for (const l of links) {
    const t = testsById[l.testId];
    if (t) result[l.sessionId]?.push(t);
  }
  return result;
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

    // Solo el catálogo del equipo: los ejercicios puntuales de una jornada
    // (sessionId != null) no se listan aquí.
    const active = await db
      .select()
      .from(schema.evaluationTests)
      .where(
        and(
          eq(schema.evaluationTests.teamId, teamId),
          isNull(schema.evaluationTests.deletedAt),
          isNull(schema.evaluationTests.sessionId),
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

    // `sessionId`      → ejercicio puntual, solo de esa jornada.
    // `attachToSession` → ejercicio de catálogo que además se añade a la jornada.
    const adhocSessionId = parseInt(String(body.sessionId ?? 0)) || null;
    const attachSessionId = adhocSessionId ?? (parseInt(String(body.attachToSession ?? 0)) || null);
    if (attachSessionId) {
      const [sess] = await db
        .select()
        .from(schema.evaluationSessions)
        .where(eq(schema.evaluationSessions.id, attachSessionId));
      // La jornada tiene que ser del mismo equipo: si no, se podría colar un
      // ejercicio en la valoración de otro equipo.
      if (!sess || sess.teamId !== teamId) {
        return c.json({ error: "Evaluación no encontrada" }, 404);
      }
    }

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
        sessionId: adhocSessionId,
        sortOrder: maxSort + 1,
      })
      .returning();

    if (attachSessionId) await linkTestToSession(attachSessionId, created.id);

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

    const bySession = await testsBySession(teamId, sessions.map((s) => s.id));

    return c.json({
      sessions: sessions.map((s) => ({ ...s, tests: bySession[s.id] ?? [] })),
    });
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
      .values({
        teamId,
        title: String(body.title ?? "").trim(),
        date,
        notes: String(body.notes ?? "").trim(),
      })
      .returning();

    // Ejercicios del catálogo elegidos al crear la jornada. Solo se aceptan los
    // del propio equipo.
    const requested = Array.isArray(body.testIds)
      ? [...new Set(body.testIds.map((v: unknown) => parseInt(String(v)) || 0).filter(Boolean))]
      : [];
    if (requested.length > 0) {
      const owned = await db
        .select({ id: schema.evaluationTests.id })
        .from(schema.evaluationTests)
        .where(
          and(
            eq(schema.evaluationTests.teamId, teamId),
            isNull(schema.evaluationTests.deletedAt),
            isNull(schema.evaluationTests.sessionId),
          ),
        );
      const validIds = new Set(owned.map((t) => t.id));
      for (const id of requested as number[]) {
        if (validIds.has(id)) await linkTestToSession(created.id, id);
      }
    }

    const bySession = await testsBySession(teamId, [created.id]);
    return c.json({ session: { ...created, tests: bySession[created.id] ?? [] } });
  })

  // ── Ejercicios de una jornada ─────────────────────────────────────────────
  .post("/sessions/:id/tests", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const sessionId = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const [session] = await db
      .select()
      .from(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.id, sessionId));
    if (!session) return c.json({ error: "Evaluación no encontrada" }, 404);

    const membership = await getMembership(user.userId, session.teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    const testId = parseInt(String(body.testId ?? 0));
    if (!testId) return c.json({ error: "testId requerido" }, 400);

    const [test] = await db
      .select()
      .from(schema.evaluationTests)
      .where(eq(schema.evaluationTests.id, testId));
    if (!test || test.deletedAt || test.teamId !== session.teamId) {
      return c.json({ error: "Prueba no encontrada" }, 404);
    }
    // Un ejercicio puntual pertenece a su jornada y no se presta a otras.
    if (test.sessionId && test.sessionId !== sessionId) {
      return c.json({ error: "Ese ejercicio es exclusivo de otra evaluación" }, 400);
    }

    await linkTestToSession(sessionId, testId);
    return c.json({ ok: true });
  })

  .delete("/sessions/:id/tests/:testId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const sessionId = parseInt(c.req.param("id"));
    const testId = parseInt(c.req.param("testId"));

    const [session] = await db
      .select()
      .from(schema.evaluationSessions)
      .where(eq(schema.evaluationSessions.id, sessionId));
    if (!session) return c.json({ error: "Evaluación no encontrada" }, 404);

    const membership = await getMembership(user.userId, session.teamId);
    if (!membership || !canWrite(membership)) return c.json({ error: "Sin permisos" }, 403);

    const [test] = await db
      .select()
      .from(schema.evaluationTests)
      .where(eq(schema.evaluationTests.id, testId));
    if (!test || test.teamId !== session.teamId) {
      return c.json({ error: "Prueba no encontrada" }, 404);
    }

    // Si la jornada aún no tenía enlaces (creada antes de esta función), se
    // materializan los del catálogo menos el que se quita: si no, quitar uno no
    // tendría efecto porque se seguirían mostrando todos.
    const links = await db
      .select()
      .from(schema.evaluationSessionTests)
      .where(eq(schema.evaluationSessionTests.sessionId, sessionId));
    if (links.length === 0) {
      const catalog = await db
        .select({ id: schema.evaluationTests.id })
        .from(schema.evaluationTests)
        .where(
          and(
            eq(schema.evaluationTests.teamId, session.teamId),
            isNull(schema.evaluationTests.deletedAt),
            isNull(schema.evaluationTests.sessionId),
          ),
        )
        .orderBy(asc(schema.evaluationTests.sortOrder), asc(schema.evaluationTests.id));
      for (const t of catalog) {
        if (t.id !== testId) await linkTestToSession(sessionId, t.id);
      }
    }

    // Quitar el ejercicio borra sus valores EN ESTA jornada (en el resto se
    // conservan).
    await db
      .delete(schema.evaluationValues)
      .where(
        and(
          eq(schema.evaluationValues.sessionId, sessionId),
          eq(schema.evaluationValues.testId, testId),
        ),
      );
    await db
      .delete(schema.evaluationSessionTests)
      .where(
        and(
          eq(schema.evaluationSessionTests.sessionId, sessionId),
          eq(schema.evaluationSessionTests.testId, testId),
        ),
      );

    // Un ejercicio puntual no vive fuera de su jornada: se elimina del todo.
    if (test.sessionId === sessionId) {
      await db.delete(schema.evaluationTests).where(eq(schema.evaluationTests.id, testId));
    }

    return c.json({ ok: true });
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
        title: body.title === undefined ? existing.title : String(body.title).trim(),
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

    // Los valores primero (FK), luego los enlaces de ejercicios, después los
    // ejercicios puntuales de la jornada y por último la jornada.
    await db
      .delete(schema.evaluationValues)
      .where(eq(schema.evaluationValues.sessionId, sessionId));
    await db
      .delete(schema.evaluationSessionTests)
      .where(eq(schema.evaluationSessionTests.sessionId, sessionId));
    await db
      .delete(schema.evaluationTests)
      .where(eq(schema.evaluationTests.sessionId, sessionId));
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

    if (sessions.length === 0) return c.json({ sessions: [], values: [], tests: [] });

    const values = await db
      .select()
      .from(schema.evaluationValues)
      .where(inArray(schema.evaluationValues.sessionId, sessions.map((s) => s.id)));

    // Incluye los ejercicios puntuales para que la exportación pueda nombrarlos.
    const tests = await db
      .select()
      .from(schema.evaluationTests)
      .where(
        and(
          eq(schema.evaluationTests.teamId, teamId),
          isNull(schema.evaluationTests.deletedAt),
        ),
      )
      .orderBy(asc(schema.evaluationTests.sortOrder), asc(schema.evaluationTests.id));

    return c.json({ sessions, values, tests });
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
    // Solo los ejercicios que forman parte de ESTA jornada (si no tiene
    // enlaces, todo el catálogo del equipo, como antes).
    const sessionTests = (await testsBySession(session.teamId, [sessionId]))[sessionId] ?? [];
    const validPlayers = new Set(teamPlayers.map((p) => p.id));
    const validTests = new Set(sessionTests.map((t) => t.id));

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
