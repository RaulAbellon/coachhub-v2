import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { assertBase64FieldsWithinLimit, PayloadTooLargeError } from "../lib/validation";


// Calculate microcycle for a given date within a team.
// Microcycle 1 = week of the team's first ever session.
// Each subsequent Monday starts a new microcycle.
async function calcMicrocycle(teamId: number, date: string): Promise<number> {
  // Get first session date of this team
  const first = await db.select({ date: schema.sessions.date })
    .from(schema.sessions)
    .where(eq(schema.sessions.teamId, teamId))
    .orderBy(asc(schema.sessions.date))
    .limit(1)
    .get();

  const firstDate = first ? new Date(first.date + "T12:00:00") : new Date(date + "T12:00:00");
  const sessionDate = new Date(date + "T12:00:00");

  // Find Monday of each week
  const getMondayOf = (d: Date) => {
    const day = d.getDay(); // 0=Sun, 1=Mon...
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const firstMonday = getMondayOf(firstDate);
  const sessionMonday = getMondayOf(sessionDate);

  const diffMs = sessionMonday.getTime() - firstMonday.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

export const sessions = new Hono()
  // GET /api/sessions?teamId=X&month=YYYY-MM
  .get("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const teamId = c.req.query("teamId");
    const month = c.req.query("month");

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
      .where(eq(schema.sessions.teamId, Number(teamId)))
      .orderBy(desc(schema.sessions.date));

    const filtered = month ? all.filter(s => s.date.startsWith(month)) : all;
    return c.json({ sessions: filtered }, 200);
  })

  // GET /api/sessions/all-teams — all sessions across all user's teams (for unified calendar)
  .get("/all-teams", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const month = c.req.query("month");

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
      .where(inArray(schema.sessions.teamId, teamIds))
      .orderBy(asc(schema.sessions.date));

    const filtered = month ? allSessions.filter(s => s.date.startsWith(month)) : allSessions;
    filtered.sort((a, b) => a.date.localeCompare(b.date));

    return c.json({ sessions: filtered, teams: userTeams }, 200);
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

    // Auto-calculate microcycle
    const microcycle = await calcMicrocycle(Number(body.teamId), body.date);

    const [session] = await db.insert(schema.sessions).values({
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
      microcycle,
    }).returning();

    return c.json({ session }, 201);
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

    // Recalculate microcycle if date or teamId changed
    const targetTeam = body.teamId ?? session.teamId;
    const targetDate = body.date ?? session.date;
    const microcycle = targetTeam ? await calcMicrocycle(Number(targetTeam), targetDate) : 1;

    const updateData: any = {
      title: body.title,
      date: body.date,
      notes: body.notes,
      objectives: body.objectives,
      duration: body.duration,
      teamId: body.teamId,
      sessionType: body.sessionType,
      microcycle,
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

    return c.json({ session: updated }, 200);
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
    return c.json({ ok: true }, 200);
  });
