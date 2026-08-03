import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { assertBase64FieldsWithinLimit, PayloadTooLargeError } from "../lib/validation";
import { checkImportRateLimit } from "../lib/rate-limit";
import {
  coerceValue,
  getCustomValuesMap,
  getLiveFieldsHydrated,
  normalizeLabel,
  toNativeColumnValue,
  upsertCustomValue,
} from "../lib/form-fields";


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

    // Campos configurables del equipo + valores personalizados de cada jugador,
    // para que la ficha pueda renderizarlos mezclados con los nativos.
    const fields = await getLiveFieldsHydrated(teamId);
    const playerIds = list.map(p => p.id);
    const values = playerIds.length > 0
      ? await db.select().from(schema.playerCustomValues)
          .where(inArray(schema.playerCustomValues.playerId, playerIds))
      : [];

    const customByPlayer: Record<number, Record<number, string>> = {};
    for (const v of values) {
      (customByPlayer[v.playerId] ??= {})[v.fieldId] = v.value;
    }

    return c.json({
      players: list.map(p => ({ ...p, customValues: customByPlayer[p.id] ?? {} })),
      fields: fields.map(f => ({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.optionsList,
        enabled: f.enabled,
        sortOrder: f.sortOrder,
        isBuiltin: f.isBuiltin,
        mapsToColumn: f.mapsToColumn,
      })),
    });
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
  // ── Valores de campos personalizados de la ficha ──
  .put("/:id/custom-values", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const playerId = parseInt(c.req.param("id"));

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
    if (!player) return c.json({ error: "No encontrada" }, 404);

    const membership = await getMembership(user.userId, player.teamId);
    if (!membership || membership.role === "viewer") return c.json({ error: "Sin permiso" }, 403);

    const body = await c.req.json().catch(() => null);
    const values = body?.values;
    if (!values || typeof values !== "object") return c.json({ error: "Se espera { values: { fieldId: valor } }" }, 400);

    const fields = await getLiveFieldsHydrated(player.teamId);
    const byId = new Map(fields.map(f => [f.id, f]));

    const errors: Record<string, string> = {};
    const accepted: { fieldId: number; value: string }[] = [];

    for (const [rawId, raw] of Object.entries(values)) {
      const fieldId = Number(rawId);
      const field = byId.get(fieldId);
      if (!field) { errors[rawId] = "Campo no encontrado en este equipo"; continue; }
      if (field.mapsToColumn) continue; // los nativos se guardan con PUT /players/:id
      const res = coerceValue(field.type, field.optionsList, raw);
      if (!res.ok) { errors[rawId] = res.error; continue; }
      accepted.push({ fieldId, value: res.value });
    }

    if (Object.keys(errors).length > 0) return c.json({ error: "Valores no válidos", errors }, 400);

    for (const a of accepted) await upsertCustomValue(playerId, a.fieldId, a.value);

    const map = await getCustomValuesMap(playerId);
    return c.json({ ok: true, customValues: Object.fromEntries(map) });
  })
  // ── Resumen del jugador (ficha + campos personalizados + asistencia + convocatorias) ──
  .get("/:id/summary", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const playerId = parseInt(c.req.param("id"));

    const [player] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
    if (!player) return c.json({ error: "No encontrada" }, 404);

    const membership = await getMembership(user.userId, player.teamId);
    if (!membership) return c.json({ error: "Sin acceso" }, 403);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, player.teamId));

    const attFrom = c.req.query("attendanceFrom") ?? "";
    const attTo = c.req.query("attendanceTo") ?? "";
    const callFrom = c.req.query("callupsFrom") ?? "";
    const callTo = c.req.query("callupsTo") ?? "";
    const inRange = (date: string, from: string, to: string) =>
      (!from || date >= from) && (!to || date <= to);

    // ── Campos + valores ──
    const fields = await getLiveFieldsHydrated(player.teamId);
    const customMap = await getCustomValuesMap(playerId);

    const fichaFields = fields
      .filter(f => f.enabled)
      .map(f => ({
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.optionsList,
        isBuiltin: f.isBuiltin,
        mapsToColumn: f.mapsToColumn,
        value: f.mapsToColumn
          ? (player as unknown as Record<string, unknown>)[f.mapsToColumn] ?? null
          : customMap.get(f.id) ?? "",
      }));

    // ── Asistencia: solo sesiones cuya lista se ha pasado ──
    const attRows = await db.select().from(schema.attendance)
      .where(eq(schema.attendance.playerId, playerId));

    const sessionIds = [...new Set(attRows.map(r => r.sessionId))];
    const sessionRows = sessionIds.length > 0
      ? await db.select().from(schema.sessions).where(inArray(schema.sessions.id, sessionIds))
      : [];
    const sessionById = new Map(sessionRows.map(s => [s.id, s]));

    const attendanceDetail = attRows
      .map(r => {
        const sess = sessionById.get(r.sessionId);
        return {
          sessionId: r.sessionId,
          date: sess?.date ?? "",
          title: sess?.title ?? "",
          sessionType: sess?.sessionType ?? "",
          status: r.status,
        };
      })
      .filter(r => r.date && inRange(r.date, attFrom, attTo))
      .sort((a, b) => a.date.localeCompare(b.date));

    const counts = { present: 0, absent: 0, justified: 0, injured: 0 } as Record<string, number>;
    for (const r of attendanceDetail) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const totalRegistradas = attendanceDetail.length;
    const asistidas = counts.present ?? 0;
    const attendanceSummary = {
      totalRegistradas,       // sesiones con lista pasada en el rango
      asistidas,
      porcentaje: totalRegistradas > 0 ? Math.round((asistidas / totalRegistradas) * 1000) / 10 : null,
      desglose: counts,
    };

    // ── Convocatorias ──
    const callupRows = await db.select().from(schema.matchCallups)
      .where(eq(schema.matchCallups.playerId, playerId));

    const teamMatches = await db.select().from(schema.matches)
      .where(eq(schema.matches.teamId, player.teamId));
    const matchById = new Map(teamMatches.map(m => [m.id, m]));
    const callupByMatch = new Map(callupRows.map(r => [r.matchId, r]));

    const callupsDetail = teamMatches
      .filter(m => inRange(m.date, callFrom, callTo))
      .map(m => ({
        matchId: m.id,
        date: m.date,
        opponent: m.opponent,
        homeAway: m.homeAway,
        called: callupByMatch.get(m.id)?.called ?? false,
        hasRecord: callupByMatch.has(m.id),
      }))
      .filter(m => m.hasRecord) // solo partidos con convocatoria hecha
      .sort((a, b) => a.date.localeCompare(b.date));

    const convocado = callupsDetail.filter(m => m.called).length;
    const callupsSummary = {
      totalConConvocatoria: callupsDetail.length,
      convocado,
      noConvocado: callupsDetail.length - convocado,
      porcentaje: callupsDetail.length > 0 ? Math.round((convocado / callupsDetail.length) * 1000) / 10 : null,
    };

    // ── Lesiones e incidencias (contexto para el PDF) ──
    const injuriesList = await db.select().from(schema.playerInjuries)
      .where(eq(schema.playerInjuries.playerId, playerId));
    const incidentsList = await db.select().from(schema.playerIncidents)
      .where(eq(schema.playerIncidents.playerId, playerId));

    void matchById;

    return c.json({
      player,
      team: team
        ? { id: team.id, name: team.name, category: team.category, color: team.color, logoData: team.logoData }
        : null,
      fields: fichaFields,
      attendance: { summary: attendanceSummary, detail: attendanceDetail },
      callups: { summary: callupsSummary, detail: callupsDetail },
      injuries: injuriesList,
      incidents: incidentsList,
      generatedAt: new Date().toISOString(),
    });
  })
  // ── Importación desde Google Forms (sin auth de usuario — el token del equipo hace de auth) ──
  // El Apps Script manda TODAS las respuestas del formulario tal cual
  // ({ "Peso (kg)": "62", ... }). El mapeo respuesta → campo se hace aquí,
  // comparando la etiqueta normalizada contra la configuración del equipo.
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
    const MAX_IMPORT_PAYLOAD_BYTES = 32_000; // 32KB: hay margen para campos personalizados
    if (contentLength > MAX_IMPORT_PAYLOAD_BYTES) {
      return c.json({ error: "Payload demasiado grande" }, 413);
    }

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.importToken, token));
    if (!team) return c.json({ error: "Token no válido" }, 404);

    const body = await c.req.json().catch(() => ({}));
    // Formato nuevo: { responses: { "Etiqueta": "valor" } }
    // Formato antiguo (compatibilidad): { name, number, height, ... } plano
    const responses: Record<string, unknown> =
      body && typeof body.responses === "object" && body.responses !== null
        ? body.responses as Record<string, unknown>
        : (body ?? {});

    const fields = await getLiveFieldsHydrated(team.id);

    // Índice de alias → campo: key interna, etiqueta actual, etiqueta del form
    // y nombre de la columna nativa (para los payloads antiguos).
    const byAlias = new Map<string, typeof fields[number]>();
    for (const f of fields) {
      const aliases = [f.key, normalizeLabel(f.label), normalizeLabel(f.formLabel ?? "")];
      if (f.mapsToColumn) aliases.push(normalizeLabel(f.mapsToColumn));
      for (const a of aliases) {
        if (a && !byAlias.has(a)) byAlias.set(a, f);
      }
    }

    const nativePatch: Record<string, unknown> = {};
    const customPatch: { fieldId: number; value: string }[] = [];
    const warnings: string[] = [];
    let resolvedName = "";

    for (const [rawKey, rawValue] of Object.entries(responses)) {
      const alias = normalizeLabel(rawKey);
      const field = byAlias.get(alias);
      if (!field) {
        warnings.push(`Pregunta sin campo asociado, ignorada: "${rawKey}"`);
        continue;
      }
      if (!field.enabled) {
        warnings.push(`Campo desactivado, ignorado: "${field.label}"`);
        continue;
      }

      const res = coerceValue(field.type, field.optionsList, rawValue, true);
      if (!res.ok) {
        warnings.push(`"${field.label}": ${res.error}`);
        continue;
      }

      if (field.key === "nombre") {
        resolvedName = res.value.trim();
        continue;
      }

      if (field.mapsToColumn) {
        nativePatch[field.mapsToColumn] = toNativeColumnValue(field.mapsToColumn, field.type, res.value);
      } else {
        customPatch.push({ fieldId: field.id, value: res.value });
      }
    }

    if (!resolvedName) {
      return c.json({ error: "Falta el campo 'Nombre y apellidos' en la respuesta" }, 400);
    }

    // Match por nombre (case/espacios insensible) dentro del equipo
    const teamPlayers = await db.select().from(schema.players).where(eq(schema.players.teamId, team.id));
    const existing = teamPlayers.find(p => p.name.trim().toLowerCase() === resolvedName.toLowerCase());

    let player;
    let action: "created" | "updated";
    if (existing) {
      const [updated] = await db.update(schema.players)
        .set({ ...nativePatch, name: existing.name })
        .where(eq(schema.players.id, existing.id)).returning();
      player = updated;
      action = "updated";
    } else {
      const [created] = await db.insert(schema.players).values({
        teamId: team.id,
        name: resolvedName,
        ...nativePatch,
      }).returning();
      player = created;
      action = "created";
    }

    for (const cp of customPatch) {
      await upsertCustomValue(player!.id, cp.fieldId, cp.value);
    }

    return c.json({ ok: true, action, player, warnings }, action === "created" ? 201 : 200);
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
