import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { requireAuth } from "../lib/auth";
import { randomBytes } from "crypto";


export const teams = new Hono()
  // Listar equipos del usuario
  .get("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const memberships = await db.select({
      teamId: schema.teamMembers.teamId,
      role: schema.teamMembers.role,
    }).from(schema.teamMembers).where(eq(schema.teamMembers.userId, user.userId));

    if (memberships.length === 0) return c.json({ teams: [] });

    const teamIds = memberships.map(m => m.teamId);
    const allTeams = await db.select().from(schema.teams);
    const userTeams = allTeams
      .filter(t => teamIds.includes(t.id))
      .map(t => {
        const role = memberships.find(m => m.teamId === t.id)?.role ?? "viewer";
        // El token de importación solo se expone a owner/editor
        const { importToken, ...rest } = t;
        return { ...rest, ...(role !== "viewer" ? { importToken } : {}), role };
      });

    return c.json({ teams: userTeams });
  })
  // Crear equipo
  .post("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    const shareCode = randomBytes(4).toString("hex").toUpperCase(); // ej: A3F2B1C0
    const importToken = randomBytes(16).toString("hex");

    const [team] = await db.insert(schema.teams).values({
      name: body.name,
      category: body.category ?? "",
      color: body.color ?? "#FF6B35",
      logoData: body.logoData ?? "",
      gender: body.gender === "masculino" ? "masculino" : "femenino",
      shareCode,
      importToken,
    }).returning();

    // El creador es owner
    await db.insert(schema.teamMembers).values({
      teamId: team.id,
      userId: user.userId,
      role: "owner",
    });

    return c.json({ team: { ...team, role: "owner" } }, 201);
  })
  // Unirse a equipo por shareCode (siempre entra como viewer; el owner asigna el rol)
  .post("/join", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    const { shareCode } = body;
    if (!shareCode) return c.json({ error: "shareCode requerido" }, 400);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.shareCode, shareCode.toUpperCase()));
    if (!team) return c.json({ error: "Código no válido" }, 404);

    // Comprobar si ya es miembro
    const existing = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, team.id), eq(schema.teamMembers.userId, user.userId)));
    if (existing.length > 0) return c.json({ error: "Ya eres miembro de este equipo" }, 409);

    // Siempre entra como viewer — el owner cambia el rol después
    await db.insert(schema.teamMembers).values({
      teamId: team.id,
      userId: user.userId,
      role: "viewer",
    });

    const { importToken, ...teamNoToken } = team;
    return c.json({ team: { ...teamNoToken, role: "viewer" } });
  })
  // Listar miembros de un equipo (solo owner/editor)
  .get("/:id/members", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.param("id"));

    const [myMembership] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, user.userId)));
    if (!myMembership) return c.json({ error: "Sin acceso" }, 403);

    const members = await db.select({
      id: schema.teamMembers.id,
      userId: schema.teamMembers.userId,
      role: schema.teamMembers.role,
      createdAt: schema.teamMembers.createdAt,
      username: schema.users.username,
      name: schema.users.displayName,
    }).from(schema.teamMembers)
      .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
      .where(eq(schema.teamMembers.teamId, teamId));

    return c.json({ members });
  })
  // Cambiar rol de un miembro (solo owner)
  .put("/:id/members/:memberId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.param("id"));
    const memberId = parseInt(c.req.param("memberId"));

    const [myMembership] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, user.userId)));
    if (!myMembership || myMembership.role !== "owner") return c.json({ error: "Solo el owner puede cambiar roles" }, 403);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    const { role } = body;
    if (!["editor", "viewer"].includes(role)) return c.json({ error: "Rol no válido" }, 400);

    // No permitir cambiar el rol del owner
    // El miembro debe pertenecer a ESTE equipo (F-0065: evita cambiar roles de
    // otros equipos pasando un memberId ajeno).
    const [target] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.id, memberId), eq(schema.teamMembers.teamId, teamId)));
    if (!target) return c.json({ error: "Miembro no encontrado en este equipo" }, 404);
    if (target.role === "owner") return c.json({ error: "No puedes cambiar el rol del owner" }, 400);

    const [updated] = await db.update(schema.teamMembers)
      .set({ role })
      .where(eq(schema.teamMembers.id, memberId))
      .returning();

    return c.json({ member: updated });
  })
  // Eliminar miembro del equipo (solo owner, no puede eliminarse a sí mismo)
  .delete("/:id/members/:memberId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.param("id"));
    const memberId = parseInt(c.req.param("memberId"));

    const [myMembership] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, user.userId)));
    if (!myMembership || myMembership.role !== "owner") return c.json({ error: "Solo el owner puede eliminar miembros" }, 403);

    // El miembro debe pertenecer a ESTE equipo (F-0066: evita eliminar miembros
    // de otros equipos pasando un memberId ajeno).
    const [target] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.id, memberId), eq(schema.teamMembers.teamId, teamId)));
    if (!target) return c.json({ error: "Miembro no encontrado en este equipo" }, 404);
    if (target.role === "owner") return c.json({ error: "No puedes eliminar al owner" }, 400);

    await db.delete(schema.teamMembers).where(eq(schema.teamMembers.id, memberId));
    return c.json({ ok: true });
  })
  // Ver un equipo
  .get("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.param("id"));

    const [membership] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, user.userId)));
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    const { importToken, ...rest } = team;
    return c.json({ team: { ...rest, ...(membership.role !== "viewer" ? { importToken } : {}), role: membership.role } });
  })
  // Editar equipo (solo owner/editor)
  .put("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.param("id"));

    const [membership] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, user.userId)));
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);
    const [team] = await db.update(schema.teams).set({
      name: body.name,
      category: body.category,
      color: body.color,
      logoData: body.logoData ?? "",
      gender: body.gender === "masculino" ? "masculino" : "femenino",
    }).where(eq(schema.teams.id, teamId)).returning();

    return c.json({ team });
  })
  // Eliminar equipo (solo owner)
  .delete("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.param("id"));

    const [membership] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, user.userId)));
    if (!membership || membership.role !== "owner") return c.json({ error: "Solo el owner puede eliminar" }, 403);

    // Borrado en cascada manual: hay que limpiar todas las tablas que referencian
    // este equipo (o sus sesiones/jugadoras) antes de poder borrar la fila del equipo.
    const teamSessions = await db.select({ id: schema.sessions.id }).from(schema.sessions)
      .where(eq(schema.sessions.teamId, teamId));
    const sessionIds = teamSessions.map(s => s.id);

    const teamPlayers = await db.select({ id: schema.players.id }).from(schema.players)
      .where(eq(schema.players.teamId, teamId));
    const playerIds = teamPlayers.map(p => p.id);

    const teamMatches = await db.select({ id: schema.matches.id }).from(schema.matches)
      .where(eq(schema.matches.teamId, teamId));
    const matchIds = teamMatches.map(m => m.id);

    // Módulo de valoraciones físicas: sus 3 tablas también referencian al equipo
    // (y a las jugadoras), así que sin borrarlas el DELETE del equipo fallaba
    // con un 500 por violación de FK.
    const teamEvalSessions = await db.select({ id: schema.evaluationSessions.id })
      .from(schema.evaluationSessions).where(eq(schema.evaluationSessions.teamId, teamId));
    const evalSessionIds = teamEvalSessions.map(s => s.id);

    const teamEvalTests = await db.select({ id: schema.evaluationTests.id })
      .from(schema.evaluationTests).where(eq(schema.evaluationTests.teamId, teamId));
    const evalTestIds = teamEvalTests.map(t => t.id);

    // Todo el borrado va en un único batch: si falla cualquier sentencia, no se
    // aplica ninguna y el equipo no queda a medio borrar (huérfanos en BD).
    const statements: BatchItem<"sqlite">[] = [];
    if (sessionIds.length > 0) {
      statements.push(db.delete(schema.annotations).where(inArray(schema.annotations.sessionId, sessionIds)));
      statements.push(db.delete(schema.attendance).where(inArray(schema.attendance.sessionId, sessionIds)));
    }
    if (matchIds.length > 0) {
      statements.push(db.delete(schema.matchCallups).where(inArray(schema.matchCallups.matchId, matchIds)));
      statements.push(db.delete(schema.matchDocuments).where(inArray(schema.matchDocuments.matchId, matchIds)));
    }
    if (playerIds.length > 0) {
      statements.push(db.delete(schema.attendance).where(inArray(schema.attendance.playerId, playerIds)));
      statements.push(db.delete(schema.playerInjuries).where(inArray(schema.playerInjuries.playerId, playerIds)));
      statements.push(db.delete(schema.playerIncidents).where(inArray(schema.playerIncidents.playerId, playerIds)));
      statements.push(db.delete(schema.matchCallups).where(inArray(schema.matchCallups.playerId, playerIds)));
      statements.push(db.delete(schema.playerCustomValues).where(inArray(schema.playerCustomValues.playerId, playerIds)));
    }
    // Los valores de valoración se borran por sesión, por prueba y por jugadora:
    // cualquiera de las tres FK bloquearía el borrado si quedara alguna fila.
    if (evalSessionIds.length > 0) {
      statements.push(db.delete(schema.evaluationValues)
        .where(inArray(schema.evaluationValues.sessionId, evalSessionIds)));
    }
    if (evalTestIds.length > 0) {
      statements.push(db.delete(schema.evaluationValues)
        .where(inArray(schema.evaluationValues.testId, evalTestIds)));
    }
    if (playerIds.length > 0) {
      statements.push(db.delete(schema.evaluationValues)
        .where(inArray(schema.evaluationValues.playerId, playerIds)));
    }
    statements.push(db.delete(schema.evaluationSessions).where(eq(schema.evaluationSessions.teamId, teamId)));
    statements.push(db.delete(schema.evaluationTests).where(eq(schema.evaluationTests.teamId, teamId)));
    statements.push(db.delete(schema.matches).where(eq(schema.matches.teamId, teamId)));
    statements.push(db.delete(schema.players).where(eq(schema.players.teamId, teamId)));
    statements.push(db.delete(schema.sessions).where(eq(schema.sessions.teamId, teamId)));
    statements.push(db.delete(schema.teamFormFields).where(eq(schema.teamFormFields.teamId, teamId)));
    statements.push(db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId)));
    statements.push(db.delete(schema.teams).where(eq(schema.teams.id, teamId)));

    await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

    return c.json({ ok: true });
  })
  // Regenerar token de importación de fichas (Google Forms). Solo owner/editor.
  .post("/:id/import-token/regenerate", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.param("id"));

    const [membership] = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, user.userId)));
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    const importToken = randomBytes(16).toString("hex");
    const [team] = await db.update(schema.teams).set({ importToken })
      .where(eq(schema.teams.id, teamId)).returning();

    return c.json({ team });
  });
