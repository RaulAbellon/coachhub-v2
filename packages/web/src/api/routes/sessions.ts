import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, desc, asc, gte, inArray, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { assertBase64FieldsWithinLimit, PayloadTooLargeError } from "../lib/validation";


/**
 * Numeración de microciclos de un equipo.
 *
 * Un microciclo es una semana ISO (lunes → domingo) que TIENE al menos una
 * sesión. La numeración es continua y no se reinicia nunca (ni por mes ni por
 * temporada): MC 1 = semana de la primera sesión del equipo, y cada semana
 * siguiente CON sesiones es el MC siguiente. Las semanas sin sesiones no
 * consumen número (si no se entrena una semana, la cuenta no salta).
 *
 * Es por equipo: el mismo día puede ser MC 5 para un equipo y MC 2 para otro.
 * Como añadir una sesión con fecha anterior a la primera existente desplaza
 * toda la cuenta, se renumera el equipo completo tras cada alta, edición o
 * borrado (`recalcTeamMicrocycles`).
 */

/** Lunes (YYYY-MM-DD) de la semana ISO de `date`. */
export function mondayOf(date: string): string {
  const d = new Date(date + "T12:00:00");
  const day = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Asigna a cada fecha el número de microciclo que le corresponde: las semanas
 * con sesiones se ordenan cronológicamente y se numeran 1, 2, 3… sin huecos.
 */
export function microcycleByMonday(dates: string[]): Map<string, number> {
  const mondays = [...new Set(dates.map(mondayOf))].sort();
  return new Map(mondays.map((monday, idx) => [monday, idx + 1]));
}

/**
 * Renumera los microciclos de todas las sesiones de un equipo y devuelve el
 * número resultante para `forDate` (si se indica). Solo escribe las filas cuyo
 * número cambia.
 */
async function recalcTeamMicrocycles(teamId: number, forDate?: string): Promise<number> {
  const rows = await db
    .select({ id: schema.sessions.id, date: schema.sessions.date, microcycle: schema.sessions.microcycle })
    .from(schema.sessions)
    .where(eq(schema.sessions.teamId, teamId))
    .orderBy(asc(schema.sessions.date))
    .all();

  const byMonday = microcycleByMonday(rows.map((r) => r.date));

  for (const row of rows) {
    const mc = byMonday.get(mondayOf(row.date)) ?? 1;
    if (row.microcycle !== mc) {
      await db.update(schema.sessions).set({ microcycle: mc }).where(eq(schema.sessions.id, row.id));
    }
  }

  if (!forDate) return 1;
  return byMonday.get(mondayOf(forDate)) ?? 1;
}

/**
 * Rango [desde, hasta] de un mes "YYYY-MM" para filtrar en SQL en vez de en JS.
 * Devuelve null si el valor no tiene el formato esperado.
 */
function monthRange(month: string | undefined): { from: string; to: string } | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  return { from: `${month}-01`, to: `${month}-31` };
}

export const sessions = new Hono()
  // GET /api/sessions?teamId=X&month=YYYY-MM
  .get("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const teamId = c.req.query("teamId");
    const range = monthRange(c.req.query("month"));

    if (!teamId) return c.json({ sessions: [] });

    // Verify membership
    const member = await db.select().from(schema.teamMembers)
      .where(and(
        eq(schema.teamMembers.teamId, Number(teamId)),
        eq(schema.teamMembers.userId, user.userId)
      ))
      .get();
    if (!member) return c.json({ error: "Acceso denegado" }, 403);

    const all = await db.select({
      id: schema.sessions.id,
      teamId: schema.sessions.teamId,
      title: schema.sessions.title,
      date: schema.sessions.date,
      notes: schema.sessions.notes,
      objectives: schema.sessions.objectives,
      duration: schema.sessions.duration,
      pdfName: schema.sessions.pdfName,
      physicalPdfName: schema.sessions.physicalPdfName,
      sessionType: schema.sessions.sessionType,
      microcycle: schema.sessions.microcycle,
      createdAt: schema.sessions.createdAt,
      updatedAt: schema.sessions.updatedAt,
    }).from(schema.sessions)
      .where(and(
        eq(schema.sessions.teamId, Number(teamId)),
        // S-08: el filtro de mes va en SQL; antes se traían TODAS las sesiones
        // del equipo y se descartaban en memoria.
        ...(range ? [gte(schema.sessions.date, range.from), lte(schema.sessions.date, range.to)] : []),
      ))
      .orderBy(desc(schema.sessions.date));

    return c.json({ sessions: all }, 200);
  })

  // GET /api/sessions/all-teams — all sessions across all user's teams (for unified calendar)
  .get("/all-teams", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const range = monthRange(c.req.query("month"));

    // Get all teams user has access to
    const memberships = await db.select({ teamId: schema.teamMembers.teamId, role: schema.teamMembers.role })
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.userId, user.userId));

    if (memberships.length === 0) return c.json({ sessions: [], teams: [] });

    const teamIds = memberships.map(m => m.teamId);

    // Get team info — include role of current user in each team
    const allTeams = await db.select().from(schema.teams);
    const userTeams = allTeams
      .filter(t => teamIds.includes(t.id))
      .map(t => ({ ...t, role: memberships.find(m => m.teamId === t.id)?.role ?? "viewer" }));

    // Get sessions for all teams in a single query (F-0007: era un query por
    // equipo dentro de un for...of, ahora es un único inArray()).
    const allSessions = await db.select({
      id: schema.sessions.id,
      teamId: schema.sessions.teamId,
      title: schema.sessions.title,
      date: schema.sessions.date,
      notes: schema.sessions.notes,
      objectives: schema.sessions.objectives,
      duration: schema.sessions.duration,
      pdfName: schema.sessions.pdfName,
      physicalPdfName: schema.sessions.physicalPdfName,
      sessionType: schema.sessions.sessionType,
      microcycle: schema.sessions.microcycle,
      createdAt: schema.sessions.createdAt,
      updatedAt: schema.sessions.updatedAt,
    }).from(schema.sessions)
      .where(and(
        inArray(schema.sessions.teamId, teamIds),
        // S-08: filtro de mes en SQL (ver monthRange).
        ...(range ? [gte(schema.sessions.date, range.from), lte(schema.sessions.date, range.to)] : []),
      ))
      .orderBy(asc(schema.sessions.date));

    return c.json({ sessions: allSessions, teams: userTeams }, 200);
  })

  // GET /api/sessions/:id
  .get("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = parseInt(c.req.param("id"));
    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
    if (!session) return c.json({ error: "No encontrada" }, 404);

    if (session.teamId) {
      const member = await db.select().from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.teamId, session.teamId), eq(schema.teamMembers.userId, user.userId)))
        .get();
      if (!member) return c.json({ error: "Acceso denegado" }, 403);
    }

    return c.json({ session }, 200);
  })

  // POST /api/sessions
  .post("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    if (!body.teamId) return c.json({ error: "teamId requerido" }, 400);

    try {
      assertBase64FieldsWithinLimit(body, ["pdfData", "physicalPdfData"]);
    } catch (e) {
      if (e instanceof PayloadTooLargeError) return c.json({ error: e.message }, 413);
      throw e;
    }

    const member = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, Number(body.teamId)), eq(schema.teamMembers.userId, user.userId)))
      .get();
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    const [inserted] = await db.insert(schema.sessions).values({
      teamId: body.teamId,
      title: body.title,
      date: body.date,
      notes: body.notes ?? "",
      objectives: body.objectives ?? "",
      duration: body.duration ?? 90,
      pdfData: body.pdfData ?? "",
      pdfName: body.pdfName ?? "",
      physicalPdfData: body.physicalPdfData ?? "",
      physicalPdfName: body.physicalPdfName ?? "",
      sessionType: body.sessionType ?? "ataque",
      microcycle: 1,
    }).returning();

    // La nueva sesión puede desplazar la numeración del resto (p. ej. si su
    // fecha es anterior a la primera existente), así que se renumera el equipo.
    await recalcTeamMicrocycles(Number(body.teamId));
    const session = await db.select().from(schema.sessions)
      .where(eq(schema.sessions.id, inserted.id)).get();

    return c.json({ session: session ?? inserted }, 201);
  })

  // PUT /api/sessions/:id
  .put("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = parseInt(c.req.param("id"));
    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
    if (!session) return c.json({ error: "No encontrada" }, 404);

    if (session.teamId) {
      const member = await db.select().from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.teamId, session.teamId), eq(schema.teamMembers.userId, user.userId)))
        .get();
      if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);
    }

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    try {
      assertBase64FieldsWithinLimit(body, ["pdfData", "physicalPdfData"]);
    } catch (e) {
      if (e instanceof PayloadTooLargeError) return c.json({ error: e.message }, 413);
      throw e;
    }

    const targetTeam = body.teamId ?? session.teamId;

    const updateData: any = {
      title: body.title,
      date: body.date,
      notes: body.notes,
      objectives: body.objectives,
      duration: body.duration,
      teamId: body.teamId,
      sessionType: body.sessionType,
      updatedAt: new Date(),
    };
    if (body.pdfData !== undefined) updateData.pdfData = body.pdfData;
    if (body.pdfName !== undefined) updateData.pdfName = body.pdfName;
    if (body.physicalPdfData !== undefined) updateData.physicalPdfData = body.physicalPdfData;
    if (body.physicalPdfName !== undefined) updateData.physicalPdfName = body.physicalPdfName;

    const [updated] = await db.update(schema.sessions)
      .set(updateData)
      .where(eq(schema.sessions.id, id))
      .returning();

    // Cambiar la fecha (o el equipo) reordena los microciclos: se renumeran el
    // equipo destino y, si la sesión se ha movido, también el de origen.
    if (targetTeam) await recalcTeamMicrocycles(Number(targetTeam));
    if (session.teamId && session.teamId !== Number(targetTeam)) {
      await recalcTeamMicrocycles(session.teamId);
    }
    const fresh = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();

    return c.json({ session: fresh ?? updated }, 200);
  })

  // DELETE /api/sessions/:id
  .delete("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = parseInt(c.req.param("id"));
    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
    if (!session) return c.json({ error: "No encontrada" }, 404);

    if (session.teamId) {
      const member = await db.select().from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.teamId, session.teamId), eq(schema.teamMembers.userId, user.userId)))
        .get();
      if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);
    }

    // F-0005: eliminar registros dependientes antes de la sesión para evitar
    // SQLITE_CONSTRAINT (foreign key). El driver HTTP de Turso no soporta
    // transacciones interactivas, así que se hace en el mismo orden secuencial
    // que el cascade manual ya existente en teams.ts / players.ts.
    await db.delete(schema.annotations).where(eq(schema.annotations.sessionId, id));
    await db.delete(schema.attendance).where(eq(schema.attendance.sessionId, id));
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    // Borrar una sesión puede dejar una semana vacía: esa semana deja de
    // consumir número y el resto del equipo se renumera.
    if (session.teamId) await recalcTeamMicrocycles(session.teamId);
    return c.json({ ok: true }, 200);
  });
