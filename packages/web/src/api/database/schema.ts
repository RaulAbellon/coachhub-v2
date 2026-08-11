import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

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
  shareCode: text("share_code").notNull().default(""), // ID para compartir (unico, ver indice abajo)
  importToken: text("import_token").notNull().default(""), // token para importar fichas vía Google Forms (unico)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  shareCodeUnique: uniqueIndex("teams_share_code_unique").on(t.shareCode),
  importTokenUnique: uniqueIndex("teams_import_token_unique").on(t.importToken),
}));

// ─── TEAM MEMBERS (usuarios con acceso a un equipo) ──────────────────────────
export const teamMembers = sqliteTable("team_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("viewer"), // "owner" | "editor" | "viewer"
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  // Cada peticion autenticada comprueba la pertenencia al equipo: sin este
  // indice era un full scan de la tabla que crece con cada usuario/equipo.
  teamUserUnique: uniqueIndex("team_members_team_user_unique").on(t.teamId, t.userId),
}));

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
}, (t) => ({
  teamDateIdx: index("sessions_team_date_idx").on(t.teamId, t.date),
}));

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
}, (t) => ({
  teamIdx: index("players_team_idx").on(t.teamId),
}));

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
}, (t) => ({
  // Casi todas las consultas de lesiones filtran por jugadora (ficha, resumen,
  // lesiones activas del equipo). Sin índice era table scan. Ver BE-031.
  playerIdx: index("player_injuries_player_idx").on(t.playerId),
}));

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
}, (t) => ({
  playerIdx: index("player_incidents_player_idx").on(t.playerId), // BE-032
}));

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
}, (t) => ({
  // GET /api/matches filtra por equipo y ordena por fecha; el dashboard agrega
  // los partidos de todos los equipos del usuario. Ver BE-020.
  teamDateIdx: index("matches_team_date_idx").on(t.teamId, t.date),
}));

// ─── MATCH CALLUPS (convocatoria: jugador convocado sí/no) ────────────────────
export const matchCallups = sqliteTable("match_callups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id").notNull().references(() => matches.id),
  playerId: integer("player_id").notNull().references(() => players.id),
  called: integer("called", { mode: "boolean" }).notNull().default(true), // convocado
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  // ÚNICO: el upsert de convocatoria es check-then-insert-or-update, así que
  // sin restricción dos peticiones simultáneas podían duplicar la fila. Ver BE-021.
  matchPlayerUnique: uniqueIndex("match_callups_match_player_unique").on(t.matchId, t.playerId),
}));

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
  // Caducidad de la sesion. Nullable por compatibilidad con los tokens creados
  // antes de existir esta columna: para esos se calcula createdAt + TTL.
  expiresAt: integer("expires_at", { mode: "timestamp" }),
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
}, (t) => ({
  // Una jugadora solo puede tener un registro de asistencia por sesión. Antes
  // era un índice normal: dos peticiones simultáneas podían crear duplicados
  // (F-0074). Verificado que no había duplicados antes de aplicarlo.
  sessionPlayerUnique: uniqueIndex("attendance_session_player_unique").on(t.sessionId, t.playerId),
  playerIdx: index("attendance_player_idx").on(t.playerId), // BE-033
}));

// ─── TEAM FORM FIELDS (configuración editable del formulario de fichas) ───────
// Cada equipo define qué campos aparecen en la ficha del jugador y en el
// Google Form de importación. Los campos "builtin" mapean a columnas nativas
// de `players`; los personalizados guardan su valor en `player_custom_values`.
export const teamFormFields = sqliteTable("team_form_fields", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id),
  key: text("key").notNull(),            // slug interno estable, nunca cambia
  label: text("label").notNull(),        // etiqueta visible (puede cambiar)
  formLabel: text("form_label").default(""), // snapshot del label al generar el Apps Script (fallback de mapeo)
  type: text("type").notNull().default("text"), // text | number | date | paragraph | select | multiselect | boolean
  options: text("options").default(""),  // JSON array de strings (select/multiselect)
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(false),
  mapsToColumn: text("maps_to_column"),  // columna de `players` o null si es personalizado
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // soft-delete
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  teamKeyUnique: uniqueIndex("team_form_fields_team_key_unique").on(t.teamId, t.key),
}));

// ─── PLAYER CUSTOM VALUES (valores de campos personalizados) ─────────────────
export const playerCustomValues = sqliteTable("player_custom_values", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id").notNull().references(() => players.id),
  fieldId: integer("field_id").notNull().references(() => teamFormFields.id),
  value: text("value").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  playerFieldUnique: uniqueIndex("player_custom_values_player_field_unique").on(t.playerId, t.fieldId),
}));

// ─── EVALUATION TESTS (pruebas físicas configurables por equipo) ─────────────
export const evaluationTests = sqliteTable("evaluation_tests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id),
  name: text("name").notNull(),                        // "Velocidad 20m"
  unit: text("unit").notNull().default(""),            // "seg", "cm", "m", "kg"
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("otro"), // velocidad | fuerza | resistencia | agilidad | flexibilidad | otro
  // Dirección de mejora: si es true, un valor MENOR es mejor (tiempos);
  // si es false, un valor MAYOR es mejor (saltos, cargas). Configurable por
  // prueba en vez de deducirlo de la categoría.
  lowerIsBetter: integer("lower_is_better", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // soft-delete: conserva el histórico
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  teamIdx: index("evaluation_tests_team_idx").on(t.teamId),
}));

// ─── EVALUATION SESSIONS (cada jornada de evaluación por equipo) ─────────────
export const evaluationSessions = sqliteTable("evaluation_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id),
  date: text("date").notNull(),               // YYYY-MM-DD
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  teamIdx: index("evaluation_sessions_team_idx").on(t.teamId),
}));

// ─── EVALUATION VALUES (valor de un jugador en una prueba, en una sesión) ────
export const evaluationValues = sqliteTable("evaluation_values", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => evaluationSessions.id),
  playerId: integer("player_id").notNull().references(() => players.id),
  testId: integer("test_id").notNull().references(() => evaluationTests.id),
  value: text("value").notNull().default(""), // valor numérico guardado como texto
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  sessionPlayerTestUnique: uniqueIndex("eval_values_session_player_test_unique").on(
    t.sessionId, t.playerId, t.testId,
  ),
  playerIdx: index("evaluation_values_player_idx").on(t.playerId),
}));
