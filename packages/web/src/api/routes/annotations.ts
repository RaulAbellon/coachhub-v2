import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireAuth } from "../lib/auth";
import { eq, and } from "drizzle-orm";


export const annotationsRoutes = new Hono()
  // GET /api/annotations/:sessionId
  .get("/:sessionId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const sessionId = Number(c.req.param("sessionId"));
    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get();
    if (!session) return c.json({ error: "Sesión no encontrada" }, 404);
    if (!session.teamId) return c.json({ error: "Esta sesión no tiene equipo asignado" }, 400);

    const member = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, session.teamId), eq(schema.teamMembers.userId, user.userId)))
      .get();
    if (!member) return c.json({ error: "Acceso denegado" }, 403);

    // viewers no ven anotaciones
    if (member.role === "viewer") return c.json({ annotations: [] });

    const notes = await db.select().from(schema.annotations)
      .where(eq(schema.annotations.sessionId, sessionId))
      .all();
    return c.json({ annotations: notes });
  })

  // POST /api/annotations/:sessionId
  .post("/:sessionId", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const sessionId = Number(c.req.param("sessionId"));
    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get();
    if (!session) return c.json({ error: "Sesión no encontrada" }, 404);
    if (!session.teamId) return c.json({ error: "Esta sesión no tiene equipo asignado" }, 400);

    const member = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, session.teamId), eq(schema.teamMembers.userId, user.userId)))
      .get();
    if (!member || member.role === "viewer") return c.json({ error: "Acceso denegado" }, 403);

    const body = await c.req.json();
    if (!body.content?.trim()) return c.json({ error: "Contenido requerido" }, 400);

    const [annotation] = await db.insert(schema.annotations).values({
      sessionId,
      userId: user.userId,
      content: body.content.trim(),
    }).returning();

    return c.json({ annotation }, 201);
  })

  // PUT /api/annotations/:id
  .put("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = Number(c.req.param("id"));
    const annotation = await db.select().from(schema.annotations).where(eq(schema.annotations.id, id)).get();
    if (!annotation) return c.json({ error: "No encontrado" }, 404);

    if (annotation.userId !== user.userId) return c.json({ error: "Acceso denegado" }, 403);

    const body = await c.req.json();
    if (!body.content?.trim()) return c.json({ error: "Contenido requerido" }, 400);

    await db.update(schema.annotations)
      .set({ content: body.content.trim(), updatedAt: new Date() })
      .where(eq(schema.annotations.id, id));

    return c.json({ ok: true });
  })

  // DELETE /api/annotations/:id
  .delete("/:id", async (c) => {
    const user = await requireAuth(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);

    const id = Number(c.req.param("id"));
    const annotation = await db.select().from(schema.annotations).where(eq(schema.annotations.id, id)).get();
    if (!annotation) return c.json({ error: "No encontrado" }, 404);

    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.id, annotation.sessionId)).get();
    if (!session) return c.json({ error: "No encontrado" }, 404);

    const member = await db.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, session.teamId!), eq(schema.teamMembers.userId, user.userId)))
      .get();

    if (annotation.userId !== user.userId && member?.role !== "owner") {
      return c.json({ error: "Acceso denegado" }, 403);
    }

    await db.delete(schema.annotations).where(eq(schema.annotations.id, id));
    return c.json({ ok: true });
  });
