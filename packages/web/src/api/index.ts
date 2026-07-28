import { Hono } from "hono";
import { cors } from "hono/cors";
import { teams } from "./routes/teams";
import { sessions } from "./routes/sessions";
import { matches } from "./routes/matches";
import { auth } from "./routes/auth";
import { players as playersRoutes, incidents as incidentsRoutes, injuries as injuriesRoutes } from "./routes/players";
import { attendanceRoutes } from "./routes/attendance";
import { annotationsRoutes } from "./routes/annotations";

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
  .route("/annotations", annotationsRoutes);

export type AppType = typeof app;
export default app;
