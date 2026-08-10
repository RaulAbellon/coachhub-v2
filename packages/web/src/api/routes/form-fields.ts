import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getMembership } from "../lib/team";
import {
  BUILTIN_BY_KEY,
  FIELD_TYPES,
  LOCKED_KEYS,
  countFieldValues,
  getLiveFieldsHydrated,
  normalizeLabel,
  parseOptions,
  slugifyKey,
} from "../lib/form-fields";

/** Devuelve { user, membership } o un objeto de error listo para responder. */
async function requireTeamAccess(c: any, teamId: number, needEditor: boolean) {
  const user = await requireAuth(c);
  if (!user) return { error: "No autorizado" as const, status: 401 as const };
  if (!teamId) return { error: "teamId requerido" as const, status: 400 as const };
  const membership = await getMembership(user.userId, teamId);
  if (!membership) return { error: "Sin acceso" as const, status: 403 as const };
  if (needEditor && membership.role === "viewer") return { error: "Sin permiso" as const, status: 403 as const };
  return { user, membership };
}

/** Genera un key libre dentro del equipo a partir de la etiqueta. */
async function uniqueKeyForTeam(teamId: number, label: string) {
  const base = slugifyKey(label);
  const existing = await db.select().from(schema.teamFormFields)
    .where(eq(schema.teamFormFields.teamId, teamId));
  const taken = new Set(existing.map(f => f.key));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function validateTypeAndOptions(type: unknown, options: unknown) {
  const t = String(type ?? "text");
  if (!(FIELD_TYPES as readonly string[]).includes(t)) {
    return { error: `Tipo de campo no válido: ${t}` };
  }
  let opts: string[] = [];
  if (Array.isArray(options)) opts = options.map(String).map(s => s.trim()).filter(Boolean);
  if ((t === "select" || t === "multiselect") && opts.length === 0) {
    return { error: "Los campos de opciones necesitan al menos una opción" };
  }
  if (opts.length > 40) return { error: "Máximo 40 opciones por campo" };
  return { type: t, options: opts };
}

export const formFields = new Hono()
  // ── Lista de campos del equipo (crea los builtin si no existen) ──
  .get("/:teamId", async (c) => {
    const teamId = parseInt(c.req.param("teamId"));
    const access = await requireTeamAccess(c, teamId, false);
    if ("error" in access) return c.json({ error: access.error }, access.status);

    const fields = await getLiveFieldsHydrated(teamId);
    return c.json({
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
        locked: LOCKED_KEYS.includes(f.key),
      })),
    });
  })

  // ── Crear campo personalizado ──
  .post("/:teamId", async (c) => {
    const teamId = parseInt(c.req.param("teamId"));
    const access = await requireTeamAccess(c, teamId, true);
    if ("error" in access) return c.json({ error: access.error }, access.status);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const label = String(body.label ?? "").trim();
    if (!label) return c.json({ error: "La etiqueta es obligatoria" }, 400);
    if (label.length > 80) return c.json({ error: "Etiqueta demasiado larga (máx. 80)" }, 400);

    const v = validateTypeAndOptions(body.type, body.options);
    if ("error" in v) return c.json({ error: v.error }, 400);

    // Ya existe un campo vivo con esa etiqueta normalizada?
    const live = await getLiveFieldsHydrated(teamId);
    if (live.some(f => normalizeLabel(f.label) === normalizeLabel(label))) {
      return c.json({ error: "Ya existe un campo con esa etiqueta" }, 409);
    }
    if (live.length >= 60) return c.json({ error: "Máximo 60 campos por equipo" }, 400);

    const key = await uniqueKeyForTeam(teamId, label);
    const maxOrder = live.reduce((m, f) => Math.max(m, f.sortOrder), 0);

    const [created] = await db.insert(schema.teamFormFields).values({
      teamId,
      key,
      label,
      formLabel: label,
      type: v.type,
      options: v.options.length > 0 ? JSON.stringify(v.options) : "",
      enabled: true,
      sortOrder: maxOrder + 10,
      isBuiltin: false,
      mapsToColumn: null,
    }).returning();

    return c.json({ field: { ...created, options: parseOptions(created.options) } }, 201);
  })

  // ── Reordenar (antes de /:teamId/:fieldId para que no colisione) ──
  .put("/:teamId/reorder", async (c) => {
    const teamId = parseInt(c.req.param("teamId"));
    const access = await requireTeamAccess(c, teamId, true);
    if ("error" in access) return c.json({ error: access.error }, access.status);

    const body = await c.req.json().catch(() => null);
    const order: unknown = body?.order;
    if (!Array.isArray(order)) return c.json({ error: "Se espera { order: [ids] }" }, 400);

    const live = await getLiveFieldsHydrated(teamId);
    const liveIds = new Set(live.map(f => f.id));
    const ids = order.map(Number).filter(id => liveIds.has(id));
    if (ids.length !== live.length) return c.json({ error: "La lista de orden no coincide con los campos del equipo" }, 400);

    for (let i = 0; i < ids.length; i++) {
      await db.update(schema.teamFormFields)
        .set({ sortOrder: i * 10, updatedAt: new Date() })
        .where(and(eq(schema.teamFormFields.id, ids[i]!), eq(schema.teamFormFields.teamId, teamId)));
    }

    return c.json({ ok: true });
  })

  // ── Copiar configuración de otro equipo (preview + confirm) ──
  .post("/:teamId/copy-from/:sourceTeamId", async (c) => {
    const teamId = parseInt(c.req.param("teamId"));
    const sourceTeamId = parseInt(c.req.param("sourceTeamId"));
    const access = await requireTeamAccess(c, teamId, true);
    if ("error" in access) return c.json({ error: access.error }, access.status);
    // El usuario debe tener acceso también al equipo origen
    const srcAccess = await requireTeamAccess(c, sourceTeamId, false);
    if ("error" in srcAccess) return c.json({ error: "Sin acceso al equipo de origen" }, 403);
    if (teamId === sourceTeamId) return c.json({ error: "Es el mismo equipo" }, 400);

    const source = await getLiveFieldsHydrated(sourceTeamId);
    const target = await getLiveFieldsHydrated(teamId);
    const targetByKey = new Map(target.map(f => [f.key, f]));

    const toCreate = source.filter(f => !f.isBuiltin && !targetByKey.has(f.key));
    const toUpdate = source.filter(f => targetByKey.has(f.key));

    const confirm = c.req.query("confirm") === "true";
    if (!confirm) {
      return c.json({
        preview: {
          nuevos: toCreate.map(f => ({ label: f.label, type: f.type })),
          actualizados: toUpdate.map(f => ({ label: f.label, type: f.type })),
          soloEnDestino: target
            .filter(f => !source.some(s => s.key === f.key))
            .map(f => ({ label: f.label, type: f.type })),
        },
      });
    }

    // Crear los que faltan
    for (const f of toCreate) {
      await db.insert(schema.teamFormFields).values({
        teamId,
        key: f.key,
        label: f.label,
        formLabel: f.label,
        type: f.type,
        options: f.options ?? "",
        enabled: f.enabled,
        sortOrder: f.sortOrder,
        isBuiltin: false,
        mapsToColumn: null,
      });
    }

    // Sincronizar los comunes (enabled, orden, etiqueta/opciones si no es builtin)
    for (const f of toUpdate) {
      const dest = targetByKey.get(f.key)!;
      const patch: Record<string, unknown> = {
        enabled: dest.key === "nombre" ? true : f.enabled,
        sortOrder: f.sortOrder,
        updatedAt: new Date(),
      };
      if (!dest.isBuiltin) {
        patch.label = f.label;
        patch.type = f.type;
        patch.options = f.options ?? "";
      }
      await db.update(schema.teamFormFields).set(patch)
        .where(eq(schema.teamFormFields.id, dest.id));
    }

    const fields = await getLiveFieldsHydrated(teamId);
    return c.json({ ok: true, copiados: toCreate.length, actualizados: toUpdate.length, total: fields.length });
  })

  // ── Actualizar campo ──
  .put("/:teamId/:fieldId", async (c) => {
    const teamId = parseInt(c.req.param("teamId"));
    const fieldId = parseInt(c.req.param("fieldId"));
    const access = await requireTeamAccess(c, teamId, true);
    if ("error" in access) return c.json({ error: access.error }, access.status);

    const [field] = await db.select().from(schema.teamFormFields)
      .where(and(eq(schema.teamFormFields.id, fieldId), eq(schema.teamFormFields.teamId, teamId)));
    if (!field || field.deletedAt !== null) return c.json({ error: "Campo no encontrado" }, 404);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Cuerpo de la petición no es JSON válido" }, 400);

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    // enabled
    if (body.enabled !== undefined) {
      const enabled = Boolean(body.enabled);
      if (!enabled && LOCKED_KEYS.includes(field.key)) {
        return c.json({ error: "Este campo no se puede desactivar: es la clave de cruce del formulario" }, 400);
      }
      patch.enabled = enabled;
    }

    // label / type / options: los builtin conservan tipo y mapeo
    if (body.label !== undefined) {
      const label = String(body.label).trim();
      if (!label) return c.json({ error: "La etiqueta es obligatoria" }, 400);
      if (label.length > 80) return c.json({ error: "Etiqueta demasiado larga (máx. 80)" }, 400);
      const live = await getLiveFieldsHydrated(teamId);
      if (live.some(f => f.id !== fieldId && normalizeLabel(f.label) === normalizeLabel(label))) {
        return c.json({ error: "Ya existe un campo con esa etiqueta" }, 409);
      }
      patch.label = label;
    }

    if (body.type !== undefined || body.options !== undefined) {
      const nextType = body.type ?? field.type;
      const nextOptions = body.options ?? parseOptions(field.options);
      if (field.isBuiltin && body.type !== undefined && body.type !== field.type) {
        return c.json({ error: "No se puede cambiar el tipo de un campo por defecto" }, 400);
      }
      const v = validateTypeAndOptions(nextType, nextOptions);
      if ("error" in v) return c.json({ error: v.error }, 400);
      patch.type = v.type;
      patch.options = v.options.length > 0 ? JSON.stringify(v.options) : "";
    }

    const [updated] = await db.update(schema.teamFormFields).set(patch)
      .where(eq(schema.teamFormFields.id, fieldId)).returning();

    return c.json({ field: { ...updated, options: parseOptions(updated.options) } });
  })

  // ── Eliminar campo (soft-delete) ──
  .delete("/:teamId/:fieldId", async (c) => {
    const teamId = parseInt(c.req.param("teamId"));
    const fieldId = parseInt(c.req.param("fieldId"));
    const access = await requireTeamAccess(c, teamId, true);
    if ("error" in access) return c.json({ error: access.error }, access.status);

    const [field] = await db.select().from(schema.teamFormFields)
      .where(and(eq(schema.teamFormFields.id, fieldId), eq(schema.teamFormFields.teamId, teamId)));
    if (!field || field.deletedAt !== null) return c.json({ error: "Campo no encontrado" }, 404);

    if (field.isBuiltin) {
      return c.json({ error: "Los campos por defecto no se eliminan, se desactivan" }, 400);
    }

    const affected = await countFieldValues(fieldId);
    if (affected > 0 && c.req.query("confirm") !== "true") {
      return c.json({ needsConfirm: true, affected }, 409);
    }

    await db.update(schema.teamFormFields)
      .set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
      .where(eq(schema.teamFormFields.id, fieldId));

    return c.json({ ok: true, affected });
  })

  // ── Restaurar un campo por defecto que se desactivó (helper) ──
  .post("/:teamId/reset-builtin/:key", async (c) => {
    const teamId = parseInt(c.req.param("teamId"));
    const key = c.req.param("key");
    const access = await requireTeamAccess(c, teamId, true);
    if ("error" in access) return c.json({ error: access.error }, access.status);

    const builtin = BUILTIN_BY_KEY.get(key);
    if (!builtin) return c.json({ error: "No es un campo por defecto" }, 404);

    const [field] = await db.select().from(schema.teamFormFields)
      .where(and(eq(schema.teamFormFields.teamId, teamId), eq(schema.teamFormFields.key, key)));
    if (!field) return c.json({ error: "Campo no encontrado" }, 404);

    const [updated] = await db.update(schema.teamFormFields).set({
      label: builtin.label,
      type: builtin.type,
      options: builtin.options ? JSON.stringify(builtin.options) : "",
      enabled: true,
      deletedAt: null,
      updatedAt: new Date(),
    }).where(eq(schema.teamFormFields.id, field.id)).returning();

    return c.json({ field: { ...updated, options: parseOptions(updated.options) } });
  });
