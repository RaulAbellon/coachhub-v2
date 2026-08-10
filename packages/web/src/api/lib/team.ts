import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

/**
 * Membresía de un usuario en un equipo, o null si no pertenece.
 *
 * Estaba copiada literalmente en players.ts, form-fields.ts y evaluations.ts,
 * con el riesgo de que una copia se actualizase y las otras no. Ver BE-041.
 */
export async function getMembership(userId: number, teamId: number) {
  const [m] = await db
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)));
  return m ?? null;
}

/** Solo owner y editor pueden escribir; viewer es de solo lectura. */
export function canWrite(m: { role: string } | null | undefined): boolean {
  return m?.role === "owner" || m?.role === "editor";
}
