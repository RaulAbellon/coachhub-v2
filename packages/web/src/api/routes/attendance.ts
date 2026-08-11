import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireAuth } from "../lib/auth";
import { eq, and, inArray, lte } from "drizzle-orm";


/** Fetch attendance for a session with player info + active injuries merged */
async function getAttendanceWithPlayers(sessionId: number, sessionDate?: string) {
  const records = await db.select().from(schema.attendance)
    .where(eq(schema.attendance.sessionId, sessionId))
    .all();

  if (records.length === 0) return [];

  const playerIds = [...new Set(records.map(r => r.playerId))];
  const players = await db.select().from(schema.players)
    .where(inArray(schema.players.id, playerIds))
    .all();

  const playerMap = new Map(players.map(p => [p.id, p]));

  // Fetch active injuries for these players on the session date
  const dateRef = sessionDate ?? new Date().toISOString().slice(0, 10);
  const injuries = await db.select().from(schema.playerInjuries)
    .where(
      and(
        inArray(schema.playerInjuries.playerId, playerIds),
        eq(schema.playerInjuries.resolved, false),
        lte(schema.playerInjuries.dateStart, dateRef),
      )
    )
    .all();

  // Filter: active if dateEnd is empty OR dateEnd >= sessionDate
  const activeInjuries = injuries.filter(inj =>
    !inj.dateEnd || inj.dateEnd === "" || inj.dateEnd >= dateRef
  );

  // Map: one active injury per player (most recent by dateStart)
  const injuryMap = new Map<number, typeof activeInjuries[0]>();
  for (const inj of activeInjuries) {
    const existing = injuryMap.get(inj.playerId);
    if (!existing || inj.dateStart > existing.dateStart) {
      injuryMap.set(inj.playerId, inj);
    }
  }

  return records.map(r => {
    const player = playerMap.get(r.playerId);
    const injury = injuryMap.get(r.playerId);
    return {
      id: r.id,
      sessionId: r.sessionId,
      playerId: r.playerId,
      status: r.status,
      createdAt: r.createdAt,
      playerName: player?.name ?? null,
      playerNumber: player?.number ?? null,
      playerPosition: player?.positions ?? null,
      isAdditional: !!player?.isAdditional,
      activeInjury: injury ? {
        id: injury.id,
        type: injury.type,
        zone: injury.zone,
        description: injury.description,
        dateStart: injury.dateStart,
        dateEnd: injury.dateEnd,
      } : null,
    };
  });
}

export const attendanceRoutes = new Hono()
  // GET /api/attendance/:sessionId — lista de asistencia
  .get("/:sessionId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const sessionId = Number(c.req.param("sessionId"));
    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get();
    if (!session) return c.json({ error: "Sesión no encontrada" }, 404);

    // Si la sesión no tiene equipo asignado, devolver lista vacía
    if (!session.teamId) return c.json({ attendance: [] });

    const member = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, session.teamId), eq(schema.teamMembers.userId, user.userId)))
      .get();
    if (!member) return c.json({ error: "Acceso denegado" }, 403);

    const sessionDate = session.date ? String(session.date).slice(0, 10) : undefined;
    const records = await getAttendanceWithPlayers(sessionId, sessionDate);
    return c.json({ attendance: records });
  })

  // POST /api/attendance/:sessionId/init — inicializa registros para todas las jugadoras activas
  .post("/:sessionId/init", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const sessionId = Number(c.req.param("sessionId"));
    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get();
    if (!session) return c.json({ error: "Sesión no encontrada" }, 404);

    if (!session.teamId) return c.json({ error: "Sesión sin equipo asignado" }, 400);

    const member = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, session.teamId), eq(schema.teamMembers.userId, user.userId)))
      .get();
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    const teamPlayers = await db.select().from(schema.players)
      .where(eq(schema.players.teamId, session.teamId))
      .all();

    const existing = await db.select().from(schema.attendance)
      .where(eq(schema.attendance.sessionId, sessionId))
      .all();
    const existingIds = new Set(existing.map(r => r.playerId));

    // Detect active injuries on session date
    const allPlayerIds = teamPlayers.map(p => p.id);
    const dateRef2 = session.date ? String(session.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const injuriesForPlayers = allPlayerIds.length > 0
      ? await db.select().from(schema.playerInjuries)
          .where(and(
            inArray(schema.playerInjuries.playerId, allPlayerIds),
            eq(schema.playerInjuries.resolved, false),
            lte(schema.playerInjuries.dateStart, dateRef2),
          ))
      : [];
    const injuredPlayerIds = new Set(
      injuriesForPlayers
        .filter(inj => !inj.dateEnd || inj.dateEnd === "" || inj.dateEnd >= dateRef2)
        .map(inj => inj.playerId)
    );

    const toInsert = teamPlayers
      .filter(p => !existingIds.has(p.id))
      .map(p => ({
        sessionId,
        playerId: p.id,
        // Lesionado -> injured; jugador adicional -> absent por defecto; resto -> present
        status: (injuredPlayerIds.has(p.id)
          ? "injured"
          : p.isAdditional ? "absent" : "present") as "present" | "injured" | "absent",
      }));

    if (toInsert.length > 0) {
      // onConflictDoNothing + unique(sessionId, playerId): si dos peticiones de
      // init entran a la vez, la segunda no duplica filas ni revienta (F-0074).
      await db.insert(schema.attendance).values(toInsert)
        .onConflictDoNothing({ target: [schema.attendance.sessionId, schema.attendance.playerId] });
    }

    const sessionDate2 = session.date ? String(session.date).slice(0, 10) : undefined;
    const records = await getAttendanceWithPlayers(sessionId, sessionDate2);
    return c.json({ attendance: records });
  })

  // PUT /api/attendance/:sessionId/:playerId — actualizar estado
  .put("/:sessionId/:playerId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const sessionId = Number(c.req.param("sessionId"));
    const playerId = Number(c.req.param("playerId"));

    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get();
    if (!session) return c.json({ error: "Sesión no encontrada" }, 404);

    if (!session.teamId) return c.json({ error: "Sesión sin equipo" }, 400);

    const member = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, session.teamId), eq(schema.teamMembers.userId, user.userId)))
      .get();
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    // La jugadora debe pertenecer al equipo de la sesión. Sin este check, un
    // usuario con acceso al equipo A podía modificar la asistencia de una
    // jugadora del equipo B conociendo su id (IDOR entre equipos). Ver BE-019.
    const player = await db.select().from(schema.players)
      .where(and(eq(schema.players.id, playerId), eq(schema.players.teamId, session.teamId)))
      .get();
    if (!player) return c.json({ error: "La jugadora no pertenece al equipo de la sesión" }, 403);

    const body = await c.req.json();
    const valid = ["present", "absent", "justified", "injured"];
    if (!valid.includes(body.status)) return c.json({ error: "Estado inválido" }, 400);

    await db.update(schema.attendance)
      .set({ status: body.status })
      .where(and(eq(schema.attendance.sessionId, sessionId), eq(schema.attendance.playerId, playerId)));

    return c.json({ ok: true });
  });
