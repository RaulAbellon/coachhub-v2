import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { withRetryingClient } from "./retry";

/**
 * Cliente libSQL con reintentos automáticos ante cortes de conexión de Turso.
 * Se envuelve aquí (y no en ./__client, que es del template) para que TODAS las
 * consultas de la API pasen por el retry sin tocar cada ruta.
 */
const client = withRetryingClient(
  createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  }),
);

export const db = drizzle(client, { schema });

export { withDbRetry, isRetryableDbError } from "./retry";
