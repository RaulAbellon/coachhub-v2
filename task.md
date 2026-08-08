# Feature: Partidos + fin de semana en calendario

## Alcance confirmado
- Partido: rival, local/visitante, hora, hora citación, pabellón/lugar, resultado (GF/GC), notas
- Convocatoria: jugadores de plantilla, convocado sí/no; lesionados auto no disponibles
- Ubicación: botón "Añadir partido" en día del calendario + pestaña "Partidos" por equipo
- PDF convocatoria: escudo, rival, hora, lugar, convocados (dejar hueco para estadísticas futuras)
- Sábado y domingo diferenciados visualmente en el calendario

## Backend  [DONE]
- [x] schema: tablas `matches` + `match_callups`
- [x] db:push aplicado (tablas creadas en Turso)
- [x] routes/matches.ts (CRUD + all-teams + callups toggle)
- [x] registrado en api/index.ts

## Frontend  [DONE]
- [x] NewMatchPage.tsx (crear, ?teamId&date)
- [x] MatchPage.tsx (detalle + editar + resultado + convocatoria + PDF)
- [x] TeamMatchesPage.tsx (pestaña partidos del equipo)
- [x] CalendarPage.tsx: finde diferenciado + partidos en grid + botón añadir partido + lista
- [x] TeamsPage.tsx: botón "Partidos"
- [x] app.tsx: rutas /matches/new, /matches/:id, /teams/:teamId/matches
- [x] NewSessionPage: preselecciona ?date

## Verificación
- [x] bun run build OK + vitest 16/16
- [x] repro Playwright crear partido + convocatoria + PDF (0 errores JS, PDF 4313 bytes, lesionado auto-descartado)
- [x] limpiar datos test
- [ ] avisar usuario -> publicar -> push GitHub

## Notas
- Auth: usar !!user en enabled, no !!token
- No tocar ficheros __-prefijados
- jspdf ya instalado

## Feature: Jugador adicional (sube de categoría inferior)  [DONE - pendiente publicar]
- [x] schema: players.is_additional (bool, default false) + columna añadida en Turso (ALTER TABLE, db:push pedía TTY)
- [x] backend players.ts: crear/editar aceptan isAdditional (import lo deja normal)
- [x] backend matches.ts: adicional NO convocado por defecto (salvo convocatoria explícita); devuelve isAdditional
- [x] backend attendance.ts: adicional status "absent" por defecto (lesionado prioridad); devuelve isAdditional
- [x] lib/additional.ts + components/AdditionalBadge.tsx (color violeta #8B5CF6 + etiqueta "Adicional")
- [x] PlayersPage: casilla "Jugador adicional" en form + borde violeta + badge en lista y ficha
- [x] MatchPage: borde violeta + badge en convocatoria + "(adicional)" en PDF
- [x] SessionPage: borde violeta + badge en asistencia
- [x] build OK + vitest 16/16 + repro_additional.py todas aserciones OK + cleanup
- [ ] avisar usuario -> publicar

## Feature: Documentos PDF en partidos (preparación/informe rival)  [DONE - pendiente publicar]
- [x] schema: tabla match_documents (id, matchId, name, pdfData, createdAt) + creada en Turso (CREATE TABLE, db:push pedía TTY)
- [x] backend matches.ts: GET /:id devuelve documents (sin pdfData); GET /:id/documents/:docId (con pdfData); POST /:id/documents (editor/owner, valida tamaño); DELETE /:id/documents/:docId (editor/owner); DELETE /:id cascada match_documents
- [x] frontend MatchPage: tarjeta "Preparación del partido" (subir PDF editor/owner, listar, Abrir, Eliminar); varios PDF por partido; viewer solo lectura
- [x] límite tamaño base64 (4MB) front + back
- [x] build OK + repro_matchdoc.py (API) + repro_matchdoc_ui.py (Playwright) todas aserciones OK + cleanup
- [ ] avisar usuario -> publicar

## Fix bugs del test + Seguridad (en progreso)
- [x] Bug: NewSessionPage usaba fetch crudo -> ahora usa authFetch (envía cookie same-origin) — arreglado el fallo de "no se pueden crear sesiones sin visitar Equipos primero"
- [x] Bug: LoginPage añadido credentials: "same-origin" para asegurar guardado de cookie de sesión
- [x] Cambiar contraseña: endpoint POST /api/auth/change-password (verifica actual, min 6, invalida otras sesiones) + UI en ProfilePage (sección Seguridad desplegable). Verificado con scripts/repro_changepwd.py
- [x] Registro ampliado: nombre, apellidos, fecha de nacimiento, rol (entrenador/analista/preparador_fisico/oficial/delegado/otro) + email + password. Validación servidor en auth.ts, columnas añadidas a users (email/first_name/last_name/birth_date/role), UI en LoginPage. Verificado con scripts/repro_auth_flow.py
- [x] Recuperar contraseña olvidada: mecanismo por email (Resend). Endpoints /api/auth/forgot-password (no revela existencia de cuenta) + /api/auth/reset-password (token 1h, un solo uso, invalida sesiones). Tabla password_reset_tokens. UI: enlace en LoginPage + ResetPasswordPage (ruta pública /reset-password). Servicio email.ts con cliente Resend lazy. Verificado end-to-end (registro->forgot->token DB->reset->login nueva contraseña, reuso de token rechazado)
- [x] RESEND_API_KEY corregida en .env (estaba pegada sin salto de línea a RUNABLE_URL). Envío real confirmado a delivered@resend.dev
- [x] build limpio + vitest 16/16 tests pasando
- [x] Tabla de usuarios: no hacía falta borrar nada (proyecto migrado a Turso propio, DB nueva y vacía)
- [x] Índice único en users.email: confirmado `users_email_unique` en la base real (aplicado vía schema + db:push)
- [x] avisado usuario -> publicado -> pusheado

## [2026-08-03] Formulario editable por equipo + PDF resumen del jugador  [DONE - pendiente publicar]
Decisiones: IDs autoincrement; mapeo Google Form -> campo en backend por etiqueta normalizada (el Apps Script no se regenera al cambiar campos); compat payload plano antiguo (límite 32KB); BUILTIN_FIELDS constante + seed lazy idempotente; reordenar con flechas ↑↓ (sin dnd-kit); % asistencia sobre sesiones con lista pasada. Select y multiselect separados. "nombre" bloqueado (clave de cruce). Builtins se desactivan (no se borran), custom con soft-delete y aviso de jugadores afectados. Config por equipo + copiar de otro equipo.

- [x] Backup previo: backups/coachhub-backup-2026-08-03.json (13 tablas)
- [x] schema: team_form_fields + player_custom_values + 2 índices únicos; db:push aplicado y verificado (ninguna tabla previa perdida)
- [x] api/lib/form-fields.ts (BUILTIN_FIELDS, normalizeLabel, coerceValue, seed lazy, helpers de valores)
- [x] api/routes/form-fields.ts (GET/POST/PUT reorder/copy-from/PUT :id/DELETE soft/reset-builtin) montado en /api/form-fields
- [x] players.ts: GET / devuelve {players con customValues, fields}; PUT /:id/custom-values; GET /:id/summary (ficha + asistencia con desglose + convocatorias + lesiones/incidencias, filtros de fechas); POST /import/:token con mapeo dinámico y warnings
- [x] web/lib/formFields.ts + components/PlayerFormSetup.tsx (2 pestañas: campos / Google Form) + TeamsPage usa el nuevo modal
- [x] PlayersPage: ficha renderiza campos activos en orden configurado (nativos + personalizados mezclados); modal de edición oculta campos desactivados y genera inputs por tipo; guarda customs con PUT /custom-values
- [x] web/lib/playerPdf.ts (jsPDF): cabecera, datos de ficha, asistencia con % y barra + detalle, convocatorias, lesiones e incidencias. Modal de exportación con rango de fechas (por defecto temporada actual) y "todo el histórico"
- [x] Verificado end-to-end en la DB real: seed lazy, crear campos custom (select/boolean), desactivar builtin, import Google Forms (mapeo + warning de pregunta sin campo), import payload plano, PUT custom-values (+ rechazo de valor no permitido), summary con 3 sesiones/1 partido (66.7% asistencia), PDF renderizado y revisado, UI revisada en navegador (ficha + modal + export). Datos de prueba borrados: DB de nuevo con 1 user / 1 team / 0 players
- [x] tsc --noEmit limpio + bun run build OK
- [ ] avisar usuario -> publicar

Aplazado: ZIP por lotes de PDFs (JSZip).

## [2026-08-05] Fix pantalla en negro al crear sesión / partido
IMPORTANTE (lección): `bunx tsc --noEmit` en packages/web da VERDE EN FALSO — el
tsconfig raíz tiene `files: []` y solo referencias de proyecto, así que no
comprueba ningún archivo. Usar SIEMPRE `bunx tsc -b --force` desde packages/web.

- [x] Causa raíz: `teamsLoaded` seguía usado en el JSX de NewSessionPage y
      NewMatchPage después de quitar el estado -> ReferenceError al montar ->
      React desmonta el árbol -> pantalla negra. Restaurado como flag de "carga
      terminada" (se pone a true al resolver o fallar la petición de equipos).
- [x] `authFetch` no importado en NewSessionPage (primer síntoma) + POST de
      sesión pasado a authFetch.
- [x] Carga de equipos movida de render a useEffect (NewSessionPage y NewMatchPage).
- [x] `navigate(-1)` no existe en wouter -> el botón "Volver" no hacía nada.
      Cambiado a `window.history.back()` en ambas páginas.
- [x] TeamsPage: restos de `setCopiedImportUrl` (borrado al migrar al modal
      PlayerFormSetup) -> ReferenceError al pulsar "Formulario". Eliminados.
- [x] Limpieza del resto de errores de tsc -b: JSX.Element -> React.ReactElement
      (BottomNav), HandballIcon exportado (Sidebar), `_m` (CalendarPage),
      isYes/onClose sin usar (PlayersPage), queries/ping.ts borrado (resto de
      plantilla, importaba `orpc` inexistente).
- [x] SessionPage: botón "Eliminar" en cada anotación (solo owner/editor) — la
      mutación deleteAnnotation existía pero no estaba cableada a la UI.
- [x] Verificado con Playwright (chrome del sandbox): login, /sessions/new,
      /matches/new, /calendar, /teams, /profile todas renderizan; sesión creada
      de verdad y redirige a /sessions/:id. 0 errores JS (salvo los 401 de
      /api/auth/me previos al login, esperados).
- [x] tsc -b limpio, build OK, vitest 16/16. Datos de prueba borrados
      (scripts/cleanup_test.mjs) -> queda 1 usuario / 1 equipo.
- [ ] avisar usuario -> publicar

## Auditoría v3 — hallazgos cerrados
- [x] F-0033 authFetch en CalendarPage, TeamSessionsPage, TeamMatchesPage,
      NewMatchPage, MatchPage, NewSessionPage (ya no queda ningún fetch crudo
      autenticado en el frontend)
- [x] F-0064 cascada al borrar equipo: matches, match_callups, match_documents,
      player_custom_values, team_form_fields
- [x] F-0065 / F-0066 validar teamId al cambiar rol y al eliminar miembro (IDOR)
- [x] F-0070 null-check de jugadora en PUT/DELETE de lesiones e incidencias
- [x] F-LIVE-002 revisado: /api/auth/me ya se llamaba solo una vez (AuthProvider)

## [2026-08-05] Rediseño "Dashboard Pro" — implementación
Doc fuente: /home/user/Attachments/coachhub-rediseño-dashboard-pro_hrSXaD.md (768 líneas, leído completo).
Preview validado por el usuario (PreviewDashboardPage.tsx, se borra al final).

Fase 1 (fundamentos) — hecho:
- styles.css: tokens nuevos (cyan #22d3ee + púrpura #a855f7 + amarillo, fondos #09090b/#0f0f11/#141416), clases btn-accent/gradient/ghost/danger, card, badge-*, section-label, inputs, stats-strip/two-col/teams-strip/page-body, nav-tip, media queries 768/1024, scrollbar 6px. `.fade-in` neutralizado (no animaciones de entrada).
- index.html: DM Sans (400-800) + title CoachHub.
- CoachHubLogo: color por defecto blanco + export CoachHubMark (cuadrado 44 con gradiente).
- components/icons.tsx: <Icon d={PATHS.x}/> compartido.
- Sidebar.tsx: reescrita a 72px icon-only con tooltips, barra activa 3x24, botón nueva sesión gradiente, avatar 32.
- Topbar.tsx: sticky 56px, breadcrumb + acciones; + ViewToggle segmentado.
- api/routes/dashboard.ts: GET /api/dashboard (stats globales, equipos con players/sessions/matches/attendance, upcoming 6, recent 6). Montado en api/index.ts.

Fase 2 (dashboard) — en curso: componentes StatsStrip/TeamCardCompact/UpcomingEvents/SessionsTable + DashboardPage; CalendarPage pasa a /calendar.
Rutas: "/" = Dashboard, "/calendar" = calendario mensual.

Verificación obligatoria: `bunx tsc -b --force` (NO --noEmit) + `bun run build` + `bunx vitest run` en packages/web + navegador real (Playwright channel=chrome).

Fase 2 (dashboard + calendario) — hecho:
- DashboardPage: query ["dashboard"], Topbar + ViewToggle + "+ Sesión", StatsStrip (4), two-col (equipos + próximos eventos), sesiones recientes. En móvil sin ViewToggle (FAB de BottomNav).
- CalendarPage: Topbar (breadcrumb + nav de mes con chevrones + ViewToggle + "+ Sesión"), .page-body, lib/sessionTypes (sessionStyle/hexToRgba/MATCH_COLOR), colores viejos fuera, sin emoji 🏐, formatDateES capitaliza solo la 1ª letra.
- BottomNav: safe-area + labels sin recorte; .page-body móvil con padding-bottom 84 para no tapar contenido.
- Verificado: tsc -b --force OK, build OK, vitest 16/16, navegador real 1440 y 375 (solo 401 esperados de /api/auth/me pre-login).

Fase 3 (resto de páginas) — en curso:
- Barrido global de colores legacy (#FF6B35/#F5A623/#FF453A/#3FB950/#58A6FF/#BC8CFF/#0D1117/#1C1C1E/#8B8B9B + rgba equivalentes) -> paleta nueva en 13 ficheros. playerPdf usa #0891b2 (contraste sobre blanco).
- TeamsPage: Topbar + page-body, grid auto-fill 340px, ?new=1 abre modal, PRESET_COLORS nueva paleta.
- Pendiente: PlayersPage, SessionPage, NewSessionPage, MatchPage, NewMatchPage, TeamSessionsPage, TeamMatchesPage, ProfilePage, LoginPage, ResetPasswordPage (Topbar + page-body).

Fase 3-6 (resto de páginas + verificación) — hecho:
- PlayersPage, SessionPage, NewSessionPage, MatchPage, NewMatchPage, TeamSessionsPage,
  TeamMatchesPage, ProfilePage, LoginPage (CoachHubMark + btn-gradient), ResetPasswordPage.
  SessionPage y MatchPage mantienen su layout fullscreen/columna propia (no .page-body en Session).
- Fechas es-ES: capFirst() en lib/sessionTypes (antes textTransform:capitalize ponía
  "Martes, 11 De Agosto De 2026").
- TeamCardCompact usa playerWord(gender) -> "4 jugadoras" / "4 jugadores".
- Verificado: tsc -b --force OK, build OK, vitest 16/16, navegador real (Chrome) en
  /, /calendar, /teams, /teams/:id/{players,sessions,matches}, /sessions/new, /matches/new,
  /profile, /sessions/:id, /matches/:id a 1440 y 375. Únicos errores de consola: 401 de
  /api/auth/me antes del login (esperado).
- Datos de prueba limpiados (scripts/cleanup_test.mjs). preview-dashboard-pro.png borrado.

## Auditoría de código (commit 8f6bc14) — correcciones aplicadas 2026-08-06
Alcance acordado con Raúl: solo críticos + graves que merecen la pena. Excluido S-01
(rate limiting en login/register: la web no será pública por ahora) y Q-02 (fragmentar
PlayersPage/SessionPage/CalendarPage: refactor grande y arriesgado, no compensa ahora).

- S-02 + índices: schema.ts añade uniqueIndex teams_share_code_unique, teams_import_token_unique,
  team_members_team_user_unique e index sessions_team_date_idx, players_team_idx,
  match_callups_match_player_idx, attendance_session_player_idx. En attendance y match_callups
  se usó index() NO único para no romper filas existentes. Aplicado con `bun run db:push --force`.
  Backup previo: backups/coachhub-backup-2026-08-06.json (verificado 0 duplicados antes).
- S-03 expiración de sesiones: auth_tokens.expires_at (nullable por compatibilidad con los 10
  tokens antiguos). Register y login guardan expiresAt = now + SESSION_MAX_AGE_SECONDS (30 d).
  getUserFromToken rechaza tokens caducados y borra la fila; si expires_at es NULL usa
  created_at + 30 d como fallback. Verificado por API: token caducado -> 401 + fila borrada,
  legacy antiguo -> 401, legacy reciente -> 200.
- S-04: unique en shareCode / importToken (arriba).
- S-05 SSRF/data-url: MatchPage.openDoc valida doc.pdfData.startsWith("data:application/pdf")
  antes del fetch; matches.ts POST /:id/documents rechaza pdfData que no sea data-url de PDF (400).
- S-06 borrado de equipo atómico: teams.ts DELETE /:id ahora arma un array de sentencias y las
  ejecuta en un único db.batch() (drizzle-libsql). Los selects previos quedan fuera del batch.
  Verificado: equipo con jugadora + sesión + partido borrado en una sola operación, sin huérfanos.
- S-07 memory leak: rate-limit.ts purga el Map cada 100 comprobaciones (claves con todos los
  timestamps fuera de la ventana). Sin setInterval, para no bloquear el cierre del proceso.
- S-10: index.html lang="en" -> lang="es".
- Q-01 ficheros muertos borrados: src/web/pages/index.tsx, src/web/lib/api.ts, src/web/lib/utils.ts,
  src/web/components/ui/button.tsx (+ carpeta components/ui vacía).
- Q-09 tipos de sesión unificados: SESSION_TYPE_OPTIONS vive solo en src/web/lib/sessionTypes.ts
  (derivado de SESSION_TYPE_STYLE). Lo consumen SessionPage, NewSessionPage y TeamSessionsPage
  (antes duplicado 3 veces y "ataque" era #22d3ee en dos de ellas vs #f97316 en la otra).
- Verificado: tsc -b --force OK, build OK, vitest 16/16, scripts/verify_redesign.py en Chrome
  (1440 y 375) sin errores nuevos (solo 401 esperados de /api/auth/me pre-login).
- Datos de prueba limpiados. Nota: siguen en la BD usuarios de pruebas antiguas
  (auditortest, equipoprueba, g1786022782) y equipos 22/23/24 — ya estaban antes, no se tocan.

## 2026-08-08 — Feature: navegador de microciclos (spec CoachHub_Feature_Microciclos)

Implementado el spec con dos correcciones sobre el texto original:
1. El `MicrocycleWidget` del spec tenía un bug: `sessionByDate` se autoreferenciaba en su
   propia inicialización (ReferenceError en runtime). Reescrito.
2. El spec pintaba horas inventadas (`16:00 + índice`) para las sesiones: `sessions` no tiene
   columna `time`. El widget muestra ahora sesiones (duración) + partidos (hora real).

Decisión de diseño: el número de MC NO es el índice de semana del mes (como proponía el spec),
sino el microciclo real de las sesiones (`sessions.microcycle`), para que coincida con los badges
"MC n" del resto de la app. Lógica en `src/web/lib/microcycles.ts`: por cada lunes del mes se toma
el microciclo más frecuente de sus sesiones; las semanas sin sesiones se extrapolan desde la más
cercana conocida; si el mes está vacío se numeran 1..N.

Ficheros:
- NUEVO `src/web/lib/microcycles.ts` — getMonday, getWeekDates, toISODate, monthMicrocycles,
  findMicrocycleIndex.
- NUEVO `src/web/lib/__tests__/microcycles.test.ts` — 10 tests (vitest.config.ts ampliado para
  incluir `src/web/**/__tests__`).
- NUEVO `src/web/components/McSelector.tsx` — pills + flechas + "Todos", prop `labels` para los
  números reales y `currentMc` (punto que marca el MC actual para acceso rápido).
- NUEVO `src/web/components/MicrocycleWidget.tsx` — widget del dashboard: cabecera MC + badge
  ACTUAL + badges de equipos, grid de 7 días con puntos (círculo = sesión, cuadrado = partido),
  lista de actividades del día seleccionado. En móvil el selector va en fila scrolleable propia.
- `pages/DashboardPage.tsx` — widget entre StatsStrip y el two-col.
- `pages/CalendarPage.tsx` — estado `activeMc` (0 = mes completo), selector en Topbar desktop y
  en fila scrolleable en móvil, días fuera del MC a opacity 0.25, resaltado del MC activo, reset
  del filtro al cambiar de mes y **las listas de "Partidos"/"Sesiones" de abajo también se filtran
  por el MC activo** (antes seguían mostrando el mes entero, era incoherente).
- No se implementa el endpoint opcional `/api/sessions/mc` (Cambio 5): el frontend ya filtra por
  fechas, no aporta nada al MVP.

Verificado: `bunx tsc -b --force` OK, `bun run build` OK, `bunx vitest run` 26/26,
`scripts/verify_microcycles.py` (NUEVO) en Chrome a 1440 y 375 → 16/16 checks OK, sin errores de
consola nuevos (solo los 401 esperados de /api/auth/me pre-login). Datos de prueba limpiados.

## 2026-08-08 — Fix: error de conexión en el login (ECONNRESET contra Turso)

**Síntoma:** `POST /api/auth/login` devolvía HTTP 500 "Internal Server Error" tanto en el
preview del sandbox como en la URL publicada.

**Causa raíz:** Turso (libSQL sobre HTTP) cierra las conexiones inactivas. Con el proceso
levantado varios días, la primera consulta tras el corte fallaba con
`ECONNRESET / "The socket connection was closed unexpectedly"` (path `/v2/pipeline`),
envuelto en un `DrizzleQueryError` sobre el `select ... from users where username = ?`.
No era un fallo de credenciales ni de esquema.

**Solución:**
- `packages/web/src/api/database/retry.ts` (NUEVO): `isRetryableDbError` (recorre `cause`/`errors`,
  lista de códigos de red + mensajes transitorios + lista negra de errores SQL/auth que NO se
  reintentan), `backoffDelay` (exponencial + jitter), `withDbRetry` (4 intentos, base 100ms) y
  `withRetryingClient` (Proxy sobre el cliente libSQL: envuelve `execute`, `batch`,
  `executeMultiple`, `migrate`, `sync`; deja pasar `transaction` porque reintentar una
  transacción interactiva no es seguro).
- `packages/web/src/api/database/index.ts`: crea el cliente libSQL envuelto en
  `withRetryingClient` y exporta `db`. Así TODAS las rutas heredan el retry sin tocar ninguna.
  `./__client.ts` (template) se queda intacto y sin usar.
- `packages/web/src/api/__tests__/db-retry.test.ts` (NUEVO): 15 tests.

**Verificado:** `bunx vitest run` → 41/41 pass (5 files). `bunx tsc -b --force` → 0.
`bun run build` → ok. Tras reiniciar `web-app`: `/api/health` → ok, login con credenciales
falsas → 401 `{"error":"Credenciales incorrectas"}` (antes 500), `/` → 200, log de errores limpio.
