import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── USERS ────────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().default(""),
  email: text("email").notNull().default("").unique(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  birthDate: text("birth_date").notNull().default(""), // YYYY-MM-DD
  role: text("role").notNull().default(""), // entrenador | analista | preparador_fisico | oficial | otro
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── PASSWORD RESET TOKENS ─────────────────────────────────────────────────────
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── TEAMS ────────────────────────────────────────────────────────────────────
export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  color: text("color").notNull().default("#FF6B35"),
  logoData: text("logo_data").default(""), // base64 escudo del club
  gender: text("gender").notNull().default("femenino"), // "masculino" | "femenino"
  shareCode: text("share_code").notNull().default(""), // ID para compartir
  importToken: text("import_token").notNull().default(""), // token para importar fichas vía Google Forms
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── TEAM MEMBERS (usuarios con acceso a un equipo) ──────────────────────────
export const teamMembers = sqliteTable("team_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("viewer"), // "owner" | "editor" | "viewer"
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SESSIONS ─────────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").references(() => teams.id),
  title: text("title").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  notes: text("notes").default(""),
  objectives: text("objectives").default(""),
  duration: integer("duration").default(90),
  // Sesión de pista
  pdfData: text("pdf_data").default(""),
  pdfName: text("pdf_name").default(""),
  // Sesión de físico
  physicalPdfData: text("physical_pdf_data").default(""),
  physicalPdfName: text("physical_pdf_name").default(""),
  // Clasificación y microciclo
  sessionType: text("session_type").notNull().default("ataque"), // "ataque" | "defensa" | "transicion" | "preparacion"
  microcycle: integer("microcycle").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── ANNOTATIONS (anotaciones en sesión, visibles solo para editores) ─────────
export const annotations = sqliteTable("annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── PLAYERS ──────────────────────────────────────────────────────────────────
export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id),
  // Datos básicos
  name: text("name").notNull(),
  number: integer("number"),
  positions: text("positions").default(""), // JSON array: ["Portera","Extremo"]
  isAdditional: integer("is_additional", { mode: "boolean" }).notNull().default(false), // jugador adicional (sube de categoría inferior): no convocado/no asistente por defecto
  photoData: text("photo_data").default(""), // base64
  // Ficha técnica
  height: integer("height"),         // cm
  weight: integer("weight"),         // kg
  wingspan: integer("wingspan"),     // cm
  birthDate: text("birth_date"),     // ISO date string: "YYYY-MM-DD"
  chronicDiseases: text("chronic_diseases").default(""),
  previousInjuries: text("previous_injuries").default(""),
  allergies: text("allergies").default(""),
  notes: text("notes").default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── PLAYER INJURIES (seguimiento de lesiones) ───────────────────────────────
export const playerInjuries = sqliteTable("player_injuries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id").notNull().references(() => players.id),
  // Descripción
  type: text("type").notNull().default("lesion"), // "lesion" | "enfermedad" | "otro"
  zone: text("zone").default(""),        // "Tobillo izquierdo", "Hombro derecho", etc.
  description: text("description").notNull().default(""),
  // Fechas
  dateStart: text("date_start").notNull(), // YYYY-MM-DD
  dateEnd: text("date_end").default(""),   // YYYY-MM-DD, vacío = en curso
  // Atención médica
  sawDoctor: integer("saw_doctor", { mode: "boolean" }).default(false),
  sawPhysio: integer("saw_physio", { mode: "boolean" }).default(false),
  medicalNotes: text("medical_notes").default(""),
  // Estado
  resolved: integer("resolved", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── PLAYER INCIDENTS (sanciones, etc.) ──────────────────────────────────────
export const playerIncidents = sqliteTable("player_incidents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id").notNull().references(() => players.id),
  type: text("type").notNull().default("sancion"), // "sancion" | "otro"
  description: text("description").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  resolved: integer("resolved", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── MATCHES (partidos) ───────────────────────────────────────────────────────
export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id),
  date: text("date").notNull(),          // YYYY-MM-DD
  time: text("time").default(""),        // hora del partido "HH:MM"
  meetingTime: text("meeting_time").default(""), // hora de citación "HH:MM"
  opponent: text("opponent").notNull().default(""), // rival
  homeAway: text("home_away").notNull().default("home"), // "home" | "away"
  venue: text("venue").default(""),      // pabellón / lugar
  // Resultado final (null = no jugado todavía)
  goalsFor: integer("goals_for"),
  goalsAgainst: integer("goals_against"),
  notes: text("notes").default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── MATCH CALLUPS (convocatoria: jugador convocado sí/no) ────────────────────
export const matchCallups = sqliteTable("match_callups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id").notNull().references(() => matches.id),
  playerId: integer("player_id").notNull().references(() => players.id),
  called: integer("called", { mode: "boolean" }).notNull().default(true), // convocado
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── MATCH DOCUMENTS (PDFs de preparación del partido) ───────────────────────
export const matchDocuments = sqliteTable("match_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id").notNull().references(() => matches.id),
  name: text("name").notNull().default(""),   // nombre del fichero
  pdfData: text("pdf_data").notNull().default(""), // base64 data-url
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── AUTH TOKENS (persistencia de sesiones de login) ─────────────────────────
export const authTokens = sqliteTable("auth_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  playerId: integer("player_id").notNull().references(() => players.id),
  status: text("status").notNull().default("present"), // "present" | "absent" | "justified" | "injured"
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
