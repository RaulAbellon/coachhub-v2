import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { assertBase64FieldsWithinLimit, PayloadTooLargeError } from "../lib/validation";
import { checkImportRateLimit } from "../lib/rate-limit";


async function getMembership(userId: number, teamId: number) {
  const [m] = await db.select().from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)));
  return m ?? null;
}

export const players = new Hono()
  .get("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.query("teamId") ?? "0");
    if (!teamId) return c.json({ error: "teamId requerido" }, 400);

    const membership = await getMembership(user.userId, teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const list = await db.select().from(schema.players).where(eq(schema.players.teamId, teamId));
    return c.json({ players: list });
  })
  .post("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const membership = await getMembership(user.userId, body.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    try {
      assertBase64FieldsWithinLimit(body, ["photoData"]);
    } catch (e) {
      if (e instanceof PayloadTooLargeError) return c.json({ error: e.message }, 413);
      throw e;
    }

    const [player] = await db.insert(schema.players).values({
      teamId: body.teamId,
      name: body.name,
      number: body.number ?? null,
      positions: body.positions ?? "",
      isAdditional: body.isAdditional ?? false,
      photoData: body.photoData ?? "",
      height: body.height ?? null,
      weight: body.weight ?? null,
      wingspan: body.wingspan ?? null,
      birthDate: body.birthDate ?? null,
      chronicDiseases: body.chronicDiseases ?? "",
      previousInjuries: body.previousInjuries ?? "",
      allergies: body.allergies ?? "",
      notes: body.notes ?? "",
    }).returning();

    return c.json({ player }, 201);
  })
  .put("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const playerId = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
    if (!player) return c.json({ error: "No encontrada" }, 404);

    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    try {
      assertBase64FieldsWithinLimit(body, ["photoData"]);
    } catch (e) {
      if (e instanceof PayloadTooLargeError) return c.json({ error: e.message }, 413);
      throw e;
    }

    const [updated] = await db.update(schema.players).set({
      name: body.name ?? player.name,
      number: body.number !== undefined ? body.number : player.number,
      positions: body.positions !== undefined ? body.positions : player.positions,
      isAdditional: body.isAdditional !== undefined ? body.isAdditional : player.isAdditional,
      photoData: body.photoData !== undefined ? body.photoData : player.photoData,
      height: body.height !== undefined ? body.height : player.height,
      weight: body.weight !== undefined ? body.weight : player.weight,
      wingspan: body.wingspan !== undefined ? body.wingspan : player.wingspan,
      birthDate: body.birthDate !== undefined ? body.birthDate : player.birthDate,
      chronicDiseases: body.chronicDiseases !== undefined ? body.chronicDiseases : player.chronicDiseases,
      previousInjuries: body.previousInjuries !== undefined ? body.previousInjuries : player.previousInjuries,
      allergies: body.allergies !== undefined ? body.allergies : player.allergies,
      notes: body.notes !== undefined ? body.notes : player.notes,
    }).where(eq(schema.players.id, playerId)).returning();

    return c.json({ player: updated });
  })
  .delete("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const playerId = parseInt(c.req.param("id"));

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
    if (!player) return c.json({ error: "No encontrada" }, 404);

    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    await db.delete(schema.attendance).where(eq(schema.attendance.playerId, playerId));
    await db.delete(schema.playerIncidents).where(eq(schema.playerIncidents.playerId, playerId));
    await db.delete(schema.playerInjuries).where(eq(schema.playerInjuries.playerId, playerId));
    await db.delete(schema.players).where(eq(schema.players.id, playerId));
    return c.json({ ok: true });
  })
  // ── Importación desde Google Forms (sin auth de usuario — el token del equipo hace de auth) ──
  .post("/import/:token", async (c) => {
    const token = c.req.param("token");
    if (!token) return c.json({ error: "Token requerido" }, 400);

    const rateLimit = checkImportRateLimit(token);
    if (!rateLimit.allowed) {
      return c.json(
        { error: "Demasiadas peticiones, inténtalo de nuevo en un momento" },
        429,
        { "Retry-After": String(Math.ceil((rateLimit.retryAfterMs ?? 1000) / 1000)) },
      );
    }

    const contentLength = Number(c.req.header("content-length") ?? 0);
    const MAX_IMPORT_PAYLOAD_BYTES = 10_000; // 10KB, más que suficiente para un fiche de jugadora en texto
    if (contentLength > MAX_IMPORT_PAYLOAD_BYTES) {
      return c.json({ error: "Payload demasiado grande" }, 413);
    }

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.importToken, token));
    if (!team) return c.json({ error: "Token no válido" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const rawName = (body.name ?? "").toString().trim();
    if (!rawName) return c.json({ error: "El campo 'name' es obligatorio" }, 400);

    const toNumberOrNull = (v: any) => {
      if (v === undefined || v === null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const normalizeDate = (v: any): string | null => {
      if (!v) return null;
      const s = v.toString().trim();
      if (!s) return null;
      // Ya en formato YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // Formato DD/MM/YYYY o DD-MM-YYYY (típico de Google Forms en español)
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) {
        const [, d, mo, y] = m;
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      return s;
    };

    const normalizePositions = (v: any): string => {
      if (v === undefined || v === null || v === "") return "";
      const arr = Array.isArray(v)
        ? v
        : v.toString().split(",").map((p: string) => p.trim()).filter(Boolean);
      return JSON.stringify(arr);
    };

    const data = {
      name: rawName,
      number: toNumberOrNull(body.number),
      positions: normalizePositions(body.positions),
      height: toNumberOrNull(body.height),
      weight: toNumberOrNull(body.weight),
      wingspan: toNumberOrNull(body.wingspan),
      birthDate: normalizeDate(body.birthDate),
      chronicDiseases: (body.chronicDiseases ?? "").toString(),
      previousInjuries: (body.previousInjuries ?? "").toString(),
      allergies: (body.allergies ?? "").toString(),
      notes: (body.notes ?? "").toString(),
    };

    // Match por nombre (case/espacios insensible) dentro del equipo
    const teamPlayers = await db.select().from(schema.players).where(eq(schema.players.teamId, team.id));
    const existing = teamPlayers.find(p => p.name.trim().toLowerCase() === rawName.toLowerCase());

    if (existing) {
      const [updated] = await db.update(schema.players).set(data)
        .where(eq(schema.players.id, existing.id)).returning();
      return c.json({ ok: true, action: "updated", player: updated });
    }

    const [created] = await db.insert(schema.players).values({
      teamId: team.id,
      ...data,
    }).returning();
    return c.json({ ok: true, action: "created", player: created }, 201);
  });

// ─── INJURIES (seguimiento de lesiones) ──────────────────────────────────────
export const injuries = new Hono()
  // GET /api/injuries/active?teamId=X — lesiones activas de todo el equipo
  .get("/active", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const teamId = parseInt(c.req.query("teamId") ?? "0");
    if (!teamId) return c.json({ error: "teamId requerido" }, 400);

    const membership = await getMembership(user.userId, teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const teamPlayers = await db.select().from(schema.players)
      .where(eq(schema.players.teamId, teamId));
    if (teamPlayers.length === 0) return c.json({ injuries: [] });

    const playerIds = teamPlayers.map(p => p.id);
    const today = new Date().toISOString().slice(0, 10);

    const activeInjuries = await db.select().from(schema.playerInjuries)
      .where(and(
        inArray(schema.playerInjuries.playerId, playerIds),
        eq(schema.playerInjuries.resolved, false),
      ));

    // Filter: started on or before today, and not ended
    const filtered = activeInjuries.filter(inj =>
      inj.dateStart <= today && (!inj.dateEnd || inj.dateEnd === "" || inj.dateEnd >= today)
    );

    const playerMap = new Map(teamPlayers.map(p => [p.id, p]));
    const result = filtered.map(inj => ({
      ...inj,
      playerName: playerMap.get(inj.playerId)?.name ?? "",
      playerNumber: playerMap.get(inj.playerId)?.number ?? null,
    }));

    return c.json({ injuries: result });
  })
  .get("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const playerId = parseInt(c.req.query("playerId") ?? "0");
    if (!playerId) return c.json({ error: "playerId requerido" }, 400);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
    if (!player) return c.json({ error: "Jugadora no encontrada" }, 404);

    const membership = await getMembership(user.userId, player.teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const list = await db.select().from(schema.playerInjuries)
      .where(eq(schema.playerInjuries.playerId, playerId));
    return c.json({ injuries: list });
  })
  .post("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, body.playerId));
    if (!player) return c.json({ error: "Jugadora no encontrada" }, 404);

    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    const [injury] = await db.insert(schema.playerInjuries).values({
      playerId: body.playerId,
      type: body.type ?? "lesion",
      zone: body.zone ?? "",
      description: body.description ?? "",
      dateStart: body.dateStart,
      dateEnd: body.dateEnd ?? "",
      sawDoctor: body.sawDoctor ?? false,
      sawPhysio: body.sawPhysio ?? false,
      medicalNotes: body.medicalNotes ?? "",
      resolved: body.resolved ?? false,
    }).returning();

    return c.json({ injury }, 201);
  })
  .put("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const injuryId = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const [injury] = await db.select().from(schema.playerInjuries)
      .where(eq(schema.playerInjuries.id, injuryId));
    if (!injury) return c.json({ error: "No encontrada" }, 404);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, injury.playerId));
    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    const [updated] = await db.update(schema.playerInjuries).set({
      type: body.type ?? injury.type,
      zone: body.zone !== undefined ? body.zone : injury.zone,
      description: body.description !== undefined ? body.description : injury.description,
      dateStart: body.dateStart ?? injury.dateStart,
      dateEnd: body.dateEnd !== undefined ? body.dateEnd : injury.dateEnd,
      sawDoctor: body.sawDoctor !== undefined ? body.sawDoctor : injury.sawDoctor,
      sawPhysio: body.sawPhysio !== undefined ? body.sawPhysio : injury.sawPhysio,
      medicalNotes: body.medicalNotes !== undefined ? body.medicalNotes : injury.medicalNotes,
      resolved: body.resolved !== undefined ? body.resolved : injury.resolved,
      updatedAt: new Date(),
    }).where(eq(schema.playerInjuries.id, injuryId)).returning();

    return c.json({ injury: updated });
  })
  .delete("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const injuryId = parseInt(c.req.param("id"));

    const [injury] = await db.select().from(schema.playerInjuries)
      .where(eq(schema.playerInjuries.id, injuryId));
    if (!injury) return c.json({ error: "No encontrada" }, 404);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, injury.playerId));
    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    await db.delete(schema.playerInjuries).where(eq(schema.playerInjuries.id, injuryId));
    return c.json({ ok: true });
  });

// ─── INCIDENTS (sanciones, etc.) ─────────────────────────────────────────────
export const incidents = new Hono()
  .get("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const playerId = parseInt(c.req.query("playerId") ?? "0");
    if (!playerId) return c.json({ error: "playerId requerido" }, 400);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
    if (!player) return c.json({ error: "Jugadora no encontrada" }, 404);

    const membership = await getMembership(user.userId, player.teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const list = await db.select().from(schema.playerIncidents)
      .where(eq(schema.playerIncidents.playerId, playerId));
    return c.json({ incidents: list });
  })
  .post("/", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, body.playerId));
    if (!player) return c.json({ error: "Jugadora no encontrada" }, 404);

    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    const [incident] = await db.insert(schema.playerIncidents).values({
      playerId: body.playerId,
      type: body.type ?? "sancion",
      description: body.description,
      date: body.date,
      resolved: body.resolved ?? false,
    }).returning();

    return c.json({ incident }, 201);
  })
  .put("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const incidentId = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const [incident] = await db.select().from(schema.playerIncidents)
      .where(eq(schema.playerIncidents.id, incidentId));
    if (!incident) return c.json({ error: "No encontrada" }, 404);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, incident.playerId));
    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    const [updated] = await db.update(schema.playerIncidents).set({
      description: body.description ?? incident.description,
      resolved: body.resolved ?? incident.resolved,
      type: body.type ?? incident.type,
      date: body.date ?? incident.date,
    }).where(eq(schema.playerIncidents.id, incidentId)).returning();

    return c.json({ incident: updated });
  })
  .delete("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const incidentId = parseInt(c.req.param("id"));

    const [incident] = await db.select().from(schema.playerIncidents)
      .where(eq(schema.playerIncidents.id, incidentId));
    if (!incident) return c.json({ error: "No encontrada" }, 404);

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, incident.playerId));
    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    await db.delete(schema.playerIncidents).where(eq(schema.playerIncidents.id, incidentId));
    return c.json({ ok: true });
  });
