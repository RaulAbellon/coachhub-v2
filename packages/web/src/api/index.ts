import { Hono } from "hono";
import { cors } from "hono/cors";
import { teams } from "./routes/teams";
import { sessions } from "./routes/sessions";
import { matches } from "./routes/matches";
import { auth } from "./routes/auth";
import { players as playersRoutes, incidents as incidentsRoutes, injuries as injuriesRoutes } from "./routes/players";
import { attendanceRoutes } from "./routes/attendance";
import { annotationsRoutes } from "./routes/annotations";
import { formFields } from "./routes/form-fields";
import { dashboard } from "./routes/dashboard";
import { evaluations } from "./routes/evaluations";

// Orígenes permitidos para la API. En producción, el dominio publicado en
// Runable (o uno propio) debe fijarse via CORS_ALLOWED_ORIGIN. Ver F-0002 en
// ai_workflow/01_AUDIT_REPORT.yaml — antes era origin: "*".
// El frontend y la API se sirven desde el mismo origen en producción, así que
// las peticiones del navegador son same-origin (sin preflight CORS). Para
// clientes externos, fija el dominio publicado en CORS_ALLOWED_ORIGIN.
const allowedOrigins = [
  process.env.CORS_ALLOWED_ORIGIN,
  "http://localhost:4200",
  "http://localhost:3000",
  "http://127.0.0.1:4200",
].filter((o): o is string => Boolean(o));

const app = new Hono()
  .basePath("api")
  .use(
    cors({
      origin: (origin) => {
        if (!origin) return undefined; // same-origin / server-to-server, sin header Origin
        return allowedOrigins.includes(origin) ? origin : undefined;
      },
      credentials: true,
    }),
  )
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .route("/auth", auth)
  .route("/teams", teams)
  .route("/sessions", sessions)
  .route("/matches", matches)
  .route("/players", playersRoutes)
  .route("/incidents", incidentsRoutes)
  .route("/injuries", injuriesRoutes)
  .route("/attendance", attendanceRoutes)
  .route("/annotations", annotationsRoutes)
  .route("/form-fields", formFields)
  .route("/dashboard", dashboard)
  .route("/evaluations", evaluations)
  // Cualquier ruta /api/* desconocida devuelve JSON, no el HTML por defecto de
  // Hono: el frontend siempre hace res.json() y con HTML petaba al parsear.
  .notFound((c) => c.json({ error: "Endpoint no encontrado" }, 404))
  // Red de seguridad global: una excepción no capturada en cualquier ruta
  // (timeout de BD, bug de programación) devolvía un 500 con cuerpo HTML que
  // podía filtrar el stack trace. Ahora se registra en servidor y el cliente
  // recibe siempre un JSON genérico. Ver BE-002.
  .onError((err, c) => {
    console.error("[api] error no capturado:", err);
    return c.json({ error: "Error interno del servidor" }, 500);
  });

export type AppType = typeof app;
export default app;
