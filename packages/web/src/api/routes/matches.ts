import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, asc, inArray, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { assertBase64FieldsWithinLimit, PayloadTooLargeError } from "../lib/validation";

/** Devuelve los jugadores del equipo con su estado de convocatoria y lesión activa */
async function getCallupsWithPlayers(matchId: number, teamId: number, matchDate: string) {
  const teamPlayers = await db.select().from(schema.players)
    .where(eq(schema.players.teamId, teamId))
    .all();

  const callups = await db.select().from(schema.matchCallups)
    .where(eq(schema.matchCallups.matchId, matchId))
    .all();
  const callMap = new Map(callups.map(c => [c.playerId, c]));

  // Lesiones activas en la fecha del partido
  const playerIds = teamPlayers.map(p => p.id);
  const dateRef = matchDate ? String(matchDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const injuries = playerIds.length > 0
    ? await db.select().from(schema.playerInjuries)
        .where(and(
          inArray(schema.playerInjuries.playerId, playerIds),
          eq(schema.playerInjuries.resolved, false),
          lte(schema.playerInjuries.dateStart, dateRef),
        )).all()
    : [];
  const injuredIds = new Set(
    injuries
      .filter(inj => !inj.dateEnd || inj.dateEnd === "" || inj.dateEnd >= dateRef)
      .map(inj => inj.playerId)
  );

  return teamPlayers
    .map(p => ({
      playerId: p.id,
      playerName: p.name,
      playerNumber: p.number,
      playerPosition: p.positions,
      photoData: p.photoData,
      isAdditional: !!p.isAdditional,
      // Si no hay registro de convocatoria: convocado por defecto salvo lesionado o jugador adicional
      called: callMap.has(p.id) ? !!callMap.get(p.id)!.called : (!injuredIds.has(p.id) && !p.isAdditional),
      injured: injuredIds.has(p.id),
    }))
    .sort((a, b) => (a.playerNumber ?? 999) - (b.playerNumber ?? 999));
}

/** Comprueba membership y rol; devuelve el member o null */
async function getMember(teamId: number, userId: number) {
  return db.select().from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)))
    .get();
}

export const matches = new Hono()
  // GET /api/matches?teamId=X&month=YYYY-MM — partidos de un equipo
  .get("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const teamId = c.req.query("teamId");
    const month = c.req.query("month");
    if (!teamId) return c.json({ matches: [] });

    const member = await getMember(Number(teamId), user.userId);
    if (!member) return c.json({ error: "Acceso denegado" }, 403);

    const all = await db.select().from(schema.matches)
      .where(eq(schema.matches.teamId, Number(teamId)))
      .orderBy(asc(schema.matches.date));

    const filtered = month ? all.filter(m => m.date.startsWith(month)) : all;
    return c.json({ matches: filtered }, 200);
  })

  // GET /api/matches/all-teams?month=YYYY-MM — todos los partidos del usuario (calendario unificado)
  .get("/all-teams", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const month = c.req.query("month");
    const memberships = await db.select({ teamId: schema.teamMembers.teamId })
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.userId, user.userId));
    if (memberships.length === 0) return c.json({ matches: [] });

    const teamIds = memberships.map(m => m.teamId);
    const all = await db.select().from(schema.matches)
      .where(inArray(schema.matches.teamId, teamIds))
      .orderBy(asc(schema.matches.date));

    const filtered = month ? all.filter(m => m.date.startsWith(month)) : all;
    return c.json({ matches: filtered }, 200);
  })

  // GET /api/matches/:id — detalle de un partido + convocatoria
  .get("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = Number(c.req.param("id"));
    const match = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).get();
    if (!match) return c.json({ error: "No encontrado" }, 404);

    const member = await getMember(match.teamId, user.userId);
    if (!member) return c.json({ error: "Acceso denegado" }, 403);

    const callups = await getCallupsWithPlayers(id, match.teamId, match.date);
    // Documentos de preparación (sin el base64 para no engordar la respuesta; se descargan aparte)
    const docs = await db.select({
      id: schema.matchDocuments.id,
      name: schema.matchDocuments.name,
      createdAt: schema.matchDocuments.createdAt,
    }).from(schema.matchDocuments).where(eq(schema.matchDocuments.matchId, id)).all();
    return c.json({ match, callups, documents: docs, role: member.role }, 200);
  })

  // GET /api/matches/:id/documents/:docId — descargar/ver un PDF (data-url completa)
  .get("/:id/documents/:docId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const id = Number(c.req.param("id"));
    const docId = Number(c.req.param("docId"));
    const match = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).get();
    if (!match) return c.json({ error: "No encontrado" }, 404);
    const member = await getMember(match.teamId, user.userId);
    if (!member) return c.json({ error: "Acceso denegado" }, 403);
    const doc = await db.select().from(schema.matchDocuments)
      .where(and(eq(schema.matchDocuments.id, docId), eq(schema.matchDocuments.matchId, id))).get();
    if (!doc) return c.json({ error: "Documento no encontrado" }, 404);
    return c.json({ document: doc }, 200);
  })

  // POST /api/matches/:id/documents — subir un PDF de preparación (editor/owner)
  .post("/:id/documents", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const id = Number(c.req.param("id"));
    const match = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).get();
    if (!match) return c.json({ error: "No encontrado" }, 404);
    const member = await getMember(match.teamId, user.userId);
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    const body = await c.req.json().catch(() => null);
    if (!body || !body.pdfData) return c.json({ error: "pdfData requerido" }, 400);
    // Solo data-urls de PDF: nada de URLs externas guardadas en la BD.
    if (typeof body.pdfData !== "string" || !body.pdfData.startsWith("data:application/pdf")) {
      return c.json({ error: "El documento debe ser un PDF" }, 400);
    }
    try {
      assertBase64FieldsWithinLimit(body, ["pdfData"]);
    } catch (e) {
      if (e instanceof PayloadTooLargeError) return c.json({ error: e.message }, 413);
      throw e;
    }

    const [doc] = await db.insert(schema.matchDocuments).values({
      matchId: id,
      name: (body.name ?? "documento.pdf").toString().slice(0, 200),
      pdfData: body.pdfData,
    }).returning({
      id: schema.matchDocuments.id,
      name: schema.matchDocuments.name,
      createdAt: schema.matchDocuments.createdAt,
    });
    return c.json({ document: doc }, 201);
  })

  // DELETE /api/matches/:id/documents/:docId — borrar un PDF (editor/owner)
  .delete("/:id/documents/:docId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const id = Number(c.req.param("id"));
    const docId = Number(c.req.param("docId"));
    const match = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).get();
    if (!match) return c.json({ error: "No encontrado" }, 404);
    const member = await getMember(match.teamId, user.userId);
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);
    await db.delete(schema.matchDocuments)
      .where(and(eq(schema.matchDocuments.id, docId), eq(schema.matchDocuments.matchId, id)));
    return c.json({ ok: true }, 200);
  })

  // POST /api/matches — crear partido
  .post("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo no es JSON válido" }, 400);
    if (!body.teamId) return c.json({ error: "teamId requerido" }, 400);
    if (!body.date) return c.json({ error: "fecha requerida" }, 400);

    const member = await getMember(Number(body.teamId), user.userId);
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    const [match] = await db.insert(schema.matches).values({
      teamId: Number(body.teamId),
      date: body.date,
      time: body.time ?? "",
      meetingTime: body.meetingTime ?? "",
      opponent: body.opponent ?? "",
      homeAway: body.homeAway === "away" ? "away" : "home",
      venue: body.venue ?? "",
      goalsFor: body.goalsFor ?? null,
      goalsAgainst: body.goalsAgainst ?? null,
      notes: body.notes ?? "",
    }).returning();

    return c.json({ match }, 201);
  })

  // PUT /api/matches/:id — actualizar partido (datos + resultado)
  .put("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = Number(c.req.param("id"));
    const match = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).get();
    if (!match) return c.json({ error: "No encontrado" }, 404);

    const member = await getMember(match.teamId, user.userId);
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo no es JSON válido" }, 400);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.date !== undefined) updateData.date = body.date;
    if (body.time !== undefined) updateData.time = body.time;
    if (body.meetingTime !== undefined) updateData.meetingTime = body.meetingTime;
    if (body.opponent !== undefined) updateData.opponent = body.opponent;
    if (body.homeAway !== undefined) updateData.homeAway = body.homeAway === "away" ? "away" : "home";
    if (body.venue !== undefined) updateData.venue = body.venue;
    if (body.goalsFor !== undefined) updateData.goalsFor = body.goalsFor === "" || body.goalsFor === null ? null : Number(body.goalsFor);
    if (body.goalsAgainst !== undefined) updateData.goalsAgainst = body.goalsAgainst === "" || body.goalsAgainst === null ? null : Number(body.goalsAgainst);
    if (body.notes !== undefined) updateData.notes = body.notes;

    const [updated] = await db.update(schema.matches)
      .set(updateData)
      .where(eq(schema.matches.id, id))
      .returning();

    return c.json({ match: updated }, 200);
  })

  // PUT /api/matches/:id/callups/:playerId — marcar convocado sí/no
  .put("/:id/callups/:playerId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = Number(c.req.param("id"));
    const playerId = Number(c.req.param("playerId"));
    const match = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).get();
    if (!match) return c.json({ error: "No encontrado" }, 404);

    const member = await getMember(match.teamId, user.userId);
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    const body = await c.req.json().catch(() => ({}));
    const called = !!body.called;

    // Verificar que el jugador pertenece al equipo
    const player = await db.select().from(schema.players)
      .where(and(eq(schema.players.id, playerId), eq(schema.players.teamId, match.teamId)))
      .get();
    if (!player) return c.json({ error: "Jugador no pertenece al equipo" }, 400);

    const existing = await db.select().from(schema.matchCallups)
      .where(and(eq(schema.matchCallups.matchId, id), eq(schema.matchCallups.playerId, playerId)))
      .get();

    if (existing) {
      await db.update(schema.matchCallups)
        .set({ called })
        .where(eq(schema.matchCallups.id, existing.id));
    } else {
      await db.insert(schema.matchCallups).values({ matchId: id, playerId, called });
    }

    return c.json({ ok: true }, 200);
  })

  // DELETE /api/matches/:id
  .delete("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = Number(c.req.param("id"));
    const match = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).get();
    if (!match) return c.json({ error: "No encontrado" }, 404);

    const member = await getMember(match.teamId, user.userId);
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    // Eliminar dependientes antes del partido (FK)
    await db.delete(schema.matchCallups).where(eq(schema.matchCallups.matchId, id));
    await db.delete(schema.matchDocuments).where(eq(schema.matchDocuments.matchId, id));
    await db.delete(schema.matches).where(eq(schema.matches.id, id));
    return c.json({ ok: true }, 200);
  });
