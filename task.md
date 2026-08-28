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

## 2026-08-08 — Microciclos continuos entre meses (cambio de regla)

**Antes:** el número de MC se calculaba como semanas transcurridas desde la primera sesión
del equipo (`diffWeeks + 1`), así que una semana de parón consumía número. Y en el frontend,
las semanas sin sesiones se numeraban por posición dentro del mes (1..N) o se extrapolaban,
lo que daba la sensación de reinicio mensual.

**Regla acordada con el usuario:**
- **Continua:** no se reinicia entre meses ni entre temporadas.
- **Por equipo:** MC 1 = semana de la primera sesión de ESE equipo. El mismo día puede ser
  MC 5 para un equipo y MC 2 para otro.
- **Densa:** solo se numeran las semanas ISO CON sesiones. Una semana sin sesiones no consume
  número (si no se entrena, la cuenta no salta).
- **Renumeración:** añadir una sesión con fecha anterior a la primera desplaza toda la cuenta
  (esa semana pasa a MC 1 y el resto sube).

**Backend** (`packages/web/src/api/routes/sessions.ts`):
- `calcMicrocycle` (semanas transcurridas) → eliminado.
- `mondayOf(date)` y `microcycleByMonday(dates)` (exportadas, testeadas): rank denso de los
  lunes con sesiones.
- `recalcTeamMicrocycles(teamId)`: renumera todas las sesiones del equipo y solo escribe las
  filas que cambian. Se llama tras POST, PUT (equipo destino + equipo origen si la sesión se
  mueve) y DELETE. El POST/PUT devuelven la sesión releída para que el front reciba el MC final.

**Frontend** (`packages/web/src/web/lib/microcycles.ts`):
- Ya NO inventa números ni extrapola: `MicrocycleWeek` pasa de `label: number` a
  `mcNumbers: number[]` + `label: string | null` ("MC 4", "MC 3 · 7" cuando dos equipos
  coinciden en semana con distinta cuenta, `null` si la semana no tiene sesiones).
- Nuevos `weekRangeLabel(monday)` ("27 jul–2 ago") y `weekLabel(week)` (MC si lo tiene, rango
  si no). `McSelector.labels` pasa de `number[]` a `string[]`.
- `CalendarPage` (pills + `scopeLabel`) y `MicrocycleWidget` (cabecera + pills) usan `weekLabel`.

**Extras:** `scripts/recalc-microcycles.mjs` (renumera la BD completa con la regla nueva,
`--dry` para simular) y `scripts/verify_microcycles.py` ampliado con sesiones del mes anterior
y del siguiente + checks de continuidad entre meses.

**Verificado:**
- `bunx vitest run` → **56/56 pass** (6 files; 11 tests nuevos de numeración backend,
  microcycles.test.ts reescrito).
- `bunx tsc -b --force` → 0. `bun run build` → ok.
- E2E por API: altas en ago/sep/oct → MC 1,1,2,3,4,5 (la semana de parón no salta); alta con
  fecha anterior → renumera a 1..6; borrar la única sesión de una semana → renumera a 1..5.
- `python3 scripts/verify_microcycles.py` (Chrome 1440 y 375) → **26/26 OK**, `checks fallidos: 0`.
  MC mes actual `[4,5,6]` → mes siguiente `[7]`, sin reinicio en MC 1; semanas vacías con rango
  de fechas. Únicos errores de consola: los 401 esperados de `/api/auth/me` pre-login.
- `node scripts/recalc-microcycles.mjs` → 0 cambios (la API y el script coinciden).
- `node scripts/cleanup_test.mjs` → `quedan: { u: 4, t: 4, s: 0, p: 0, m: 0 }`.

---

## Fix: en móvil no aparecían "+ Añadir sesión / + Añadir partido" al pulsar un día

**Síntoma (reportado por el usuario):** en el móvil real, al pulsar un día del calendario no
salían los botones de añadir sesión/partido. En el navegador de escritorio con ventana estrecha
sí funcionaba, así que no se reproducía con un simple resize.

**Causa raíz:** `useIsMobile` decidía el modo con `window.innerWidth`. En Chrome/Safari de móvil,
si algo del layout desborda a lo ancho, el navegador ensancha el *viewport de layout* y
`innerWidth` devuelve el ancho del CONTENIDO, no el de la pantalla. Reproducido con Playwright
usando `is_mobile=True, has_touch=True` (imprescindible; con solo `viewport=390` NO se reproduce):
`innerWidth: 1137` con `clientWidth: 390`. Resultado: primer render en modo escritorio → el layout
de escritorio desborda → `innerWidth` grande → se quedaba en escritorio para siempre, y el bottom
sheet móvil del calendario (donde viven esos botones) nunca se montaba
(`if (!selectedDay || !isMobile) return null` en `DaySheet`).

Descartados como causa: permisos (`canEdit`, el usuario de prueba es `owner`), el meta viewport
(está correcto en `index.html`) y el marcado del sheet (los botones existen en el DOM).

**Fix** (`packages/web/src/web/hooks/useIsMobile.ts`, reescrito):
- Detección con `window.matchMedia("(max-width: 767.98px)")`, que sí va contra el viewport real,
  y suscripción al evento `change` del media query list en vez de al `resize`.
- Fallback a `document.documentElement.clientWidth` (y solo en último caso a `innerWidth`) para
  entornos sin `matchMedia`.
- `useState` inicializado de forma lazy con el valor real → sin primer render en escritorio ni
  parpadeo.
- Exporta `mobileMediaQuery(breakpoint)` y `readIsMobile(breakpoint, win?)` (con `window`
  inyectable) para poder testear la lógica pura en el entorno node de vitest.

**Verificado:**
- `bunx vitest run` → **63/63 pass** (7 files; 7 tests nuevos en
  `src/web/hooks/__tests__/useIsMobile.test.ts`, incluido el caso clave
  `innerWidth 1137` + `clientWidth 390` → `true`).
- `bunx tsc -b --force` → 0. `bun run build` → ok. `pm2 restart web-app` + `/api/health` → ok.
- Reproducción con `/tmp/mob2.py` tras el fix: `390-ismobile` pasa de
  `{inner: 1137, scrollW: 1137}, bottomSheets: 0` a `{inner: 390, scrollW: 390}, bottomSheets: 2`,
  con `+ Añadir sesión` visible en `y: 736`. Igual en `390-plain` y `375-plain`.
- Repaso del resto de consumidores de `useIsMobile` (`/`, `/calendar`, `/teams`, `/players` con
  `is_mobile=True`): bottom nav presente, sidebar oculto, sin scroll horizontal
  (`scrollW == clientWidth == 390`), 0 errores de consola.

---

## Módulo: Valoraciones físicas (tests, jornadas, comparativa)

Implementado siguiendo la guía `CoachHub_Valoraciones_Implementacion.md`, con las
desviaciones acordadas con el usuario (ver "Decisiones").

### Esquema (3 tablas nuevas en `packages/web/src/api/database/schema.ts`)
- `evaluation_tests` — pruebas configurables por equipo: `name`, `unit`, `description`,
  `category` (velocidad/fuerza/resistencia/agilidad/flexibilidad/otro), `lower_is_better`,
  `sort_order`, `deleted_at` (soft-delete: al borrar una prueba se conservan los valores
  históricos). Índice por `team_id`.
- `evaluation_sessions` — jornadas de evaluación: `date`, `notes`. Índice por `team_id`.
- `evaluation_values` — una celda = (jornada, jugador, prueba, valor). Índice único
  `eval_values_session_player_test_unique` + índice por `player_id`.

Aplicado con `bun run db:push` desde `packages/web` (NO `db:generate`/`db:migrate`: no hay
historial de migraciones en el repo y `db:generate` genera un `0000_*.sql` con TODAS las
tablas). Backup previo: `backups/coachhub-backup-2026-08-10.json`.

### API (`packages/web/src/api/routes/evaluations.ts`, montado en `/api/evaluations`)
- `GET/POST /tests`, `PUT/DELETE /tests/:id` (soft-delete, `recordCount` en el GET)
- `GET/POST /sessions`, `PUT/DELETE /sessions/:id`
- `GET /values?sessionId=` (tabla de registro) y `GET /values?playerId=` (historial de la
  ficha; el `teamId` se deriva del jugador, no del query param → anti-IDOR)
- `GET /history?teamId=` (todas las jornadas + valores: comparativa y export)
- `PUT /values/batch` — guarda varias celdas de una jornada; valida que jugador y prueba
  pertenezcan al equipo y **borra** la fila cuando el valor llega vacío
- Escritura sólo para `owner`/`editor`; `viewer` recibe 403 en todo POST/PUT/DELETE
  (verificado con `scripts/seed_eval_viewer.mjs`).

### Frontend
- `packages/web/src/web/pages/EvaluationsPage.tsx` — ruta `/teams/:teamId/evaluations`,
  tres vistas: **Pruebas**, **Registrar** y **Comparativa**. Tabla en escritorio y tarjetas
  por jugador en móvil. Badge Registrado/Pendiente por jugador.
- `packages/web/src/web/lib/evaluations.ts` — lógica pura (testeable sin DOM):
  `parseValue` (acepta coma decimal), `computeTrend`, `computeStats`, `rankPlayers`,
  `buildEvaluationsCsv` (separador `;` + BOM para Excel en español), formateo de fechas.
- `PlayersPage.tsx` — tercera pestaña **Evaluaciones** en la ficha del jugador: resumen por
  prueba con último valor y tendencia, y detalle desplegable con mini-gráfico y timeline.
- `TeamsPage.tsx` — botón "Valoraciones" en la tarjeta de equipo.

### Decisiones (acordadas con el usuario, se apartan de la guía)
1. `ViewToggle` (Dashboard/Calendario) eliminado del topbar de `DashboardPage` y
   `CalendarPage` — ya está en la barra lateral. El componente sigue exportado en `Topbar.tsx`.
2. Guardado con **debounce de 600 ms** + estado local e indicador "Guardando… / Guardado",
   en vez de un PUT por pulsación.
3. "Nueva evaluación" abre un **modal con fecha y notas**, no crea la jornada directamente.
4. Cada prueba tiene su propio campo **`lowerIsBetter`** ("menor es mejor" / "mayor es
   mejor"); no se deduce de la categoría.
5. La tabla de registro incluye **todos** los jugadores, también los adicionales (con badge).
6. Extras: **exportación a CSV/Excel** y **comparativa entre jugadores** de una misma prueba.
   Export a PDF descartado.

### Bugs encontrados y corregidos durante la verificación E2E
- **Valores guardados en la jornada equivocada:** al crear una jornada nueva,
  `setSelectedSessionId(nueva)` corría antes de que el refetch de `eval-sessions` la
  incluyera, así que el efecto que valida la selección volvía a la jornada anterior y las
  celdas se escribían allí. Fix: `await qc.invalidateQueries(["eval-sessions"])` antes de
  seleccionar la nueva jornada.
- **Pérdida de los últimos cambios al cambiar de jornada:** el debounce pendiente se
  descartaba. Fix: `pendingSessionRef` guarda a qué jornada pertenecen los cambios, se
  vuelcan antes de cambiar y el `sessionId` viaja explícito en el payload del batch.
- **Barras de la comparativa al revés en pruebas de tiempo:** la longitud era proporcional
  al número, así que la peor marca tenía la barra más larga. Fix: `barRatio` invierte la
  escala cuando `lowerIsBetter`.

### Verificado
- `bunx vitest run` → **79/79 pass** (16 nuevos en `src/web/lib/__tests__/evaluations.test.ts`).
- `bunx tsc -b --force` → 0 errores. `bun run build` → ok. `bun run lint` → 8 errores de
  convenciones preexistentes, ninguno nuevo.
- E2E con Playwright (Chrome), escritorio 1440x950 y móvil real `is_mobile=True, has_touch=True`:
  crear 2 pruebas (una "menor es mejor"), 2 jornadas, rellenar 16 celdas, debounce
  "Guardando…"→"Guardado", badges Registrado, comparativa con ranking y tendencias
  (-0.08 en verde, +0.05 en rojo), descarga del CSV con las dos jornadas y la jugadora
  adicional marcada, y pestaña Evaluaciones de la ficha con "2 registros" y flechas.
  0 errores de página. Capturas en `/tmp/eval/`.
- Rol `viewer`: sin botones de crear/editar/eliminar, inputs deshabilitados y 403 en los
  7 endpoints de escritura.
- Datos de prueba eliminados con `node scripts/cleanup_test.mjs` (ampliado para reconocer
  los usuarios `ev*`/`vw*` y limpiar las tablas de valoraciones). Quedan 5 usuarios y 5
  equipos reales.

### Scripts añadidos
- `scripts/seed_eval_test.mjs` — crea usuario + equipo + 4 jugadoras de prueba vía API.
- `scripts/seed_eval_viewer.mjs` — crea un viewer unido al equipo y comprueba los 403.

---

## 2026-08-10 — Auditoría externa v2 (PDF `CoachHub_v2_Auditoria_Completa`)

Revisada la auditoría completa. **No se ha aplicado todo**: varios hallazgos están mal
diagnosticados o contradicen decisiones ya tomadas. Detalle abajo.

### Aplicado

**Seguridad**
- **BE-019 (IDOR asistencia, el más grave).** `PUT /api/attendance/:sessionId/:playerId`
  comprobaba el acceso al equipo de la sesión pero **no** que la jugadora perteneciera a
  ese equipo: un editor del equipo A podía cambiar la asistencia de una jugadora del
  equipo B conociendo su id. Ahora se valida `players.teamId === session.teamId` → 403.
  Verificado con curl: sesión 169 (equipo 40) + jugadora 80 (equipo 39) → **403
  "La jugadora no pertenece al equipo de la sesión"**.

**Backend / datos**
- **BE-002.** `src/api/index.ts` no tenía `notFound` ni `onError`: una ruta de API
  inexistente devolvía el HTML del SPA y una excepción, el stack de Hono. Ahora
  404 `{"error":"Endpoint no encontrado"}` y 500 JSON. Verificado con curl.
- **BE-003.** `database/index.ts` usaba `process.env.DATABASE_URL!`; ahora lanza un error
  explícito al arrancar si falta.
- **BE-021.** `match_callups` no tenía restricción de unicidad → convocatorias duplicadas.
  Añadido `uniqueIndex("match_callups_match_player_unique")` y el upsert de `matches.ts`
  pasa a `onConflictDoUpdate`. Comprobado antes con `/tmp/dupchk.mjs`: 0 duplicados
  previos, así que el índice entra sin conflicto.
- **BE-020/031/032/033.** Índices añadidos: `player_injuries_player_idx`,
  `player_incidents_player_idx`, `matches_team_date_idx`, `attendance_player_idx`.
- **BE-041.** `getMembership` estaba duplicado en 4 rutas. Extraído a
  `src/api/lib/team.ts` (`getMembership` + `canWrite`) y consumido desde `players.ts`,
  `form-fields.ts` y `evaluations.ts`.
- Los 5 índices aplicados con **`bun run db:push`** y verificados en `sqlite_master`.
  Backup previo: `backups/coachhub-backup-2026-08-10.json` (60 filas / 18 tablas).

**Frontend**
- **F-009.** `authFetchJson<T>()` nuevo en `lib/authFetch.ts`: lanza si `!res.ok`
  extrayendo `body.error`. Antes un 500 se parseaba como JSON y llegaba basura a la UI.
  Migradas las queries/mutaciones de `EvaluationsPage`, `DashboardPage` y `PlayersPage`.
- **F-034.** El dashboard se quedaba en blanco si fallaba una query. Ahora banner
  `role="alert"` con botón **Reintentar**.
- **F-001.** Nueva `NotFoundPage` + `<Route component={NotFoundPage} />` al final del
  Switch autenticado. Antes una URL inválida daba pantalla vacía. Verificado en E2E.
- **F-031.** En `EvaluationsPage`, el cleanup del efecto de autoguardado ahora llama a
  `flushRef.current()`: al navegar durante el debounce se perdían los últimos valores.
- **F-014 / LIVE-012 (a11y).** `ModalShell` pasa a `role="dialog"` + `aria-modal="true"`,
  cierra con **Escape**, atrapa el foco con Tab/Shift+Tab y lo devuelve al elemento
  previo al cerrarse. `BottomNav`: `aria-label` en los 4 enlaces, `aria-current="page"`
  en el activo, `aria-label="Nueva sesión"` en el FAB central y `aria-label` en el `<nav>`.

### Descartado (con motivo)
- **BE-001 (path traversal).** Exagerado, y el fichero implicado es `__server.ts`, que es
  plantilla de la plataforma: **prohibido editar**.
- **BE-036 (migraciones drizzle).** Contradice la decisión ya tomada: `db:generate`
  genera un `0000_*.sql` con TODAS las tablas y es peligroso sobre la BD real. Se sigue
  usando `db:push`.
- **F-023 (partir `PlayersPage`).** Ya descartado antes por relación riesgo/beneficio.
- **LIVE-001 / LIVE-002.** Culpan a "MUI". **La app no tiene MUI instalado**; el
  diagnóstico es falso. Lo real detrás era falta de a11y, ya cubierto arriba.
- **LIVE-010.** Dice que la Sidebar navega mal; `Sidebar.tsx` usa `<Link href="/teams">`
  fijo. No reproducible.
- **LIVE-011 (dashboard móvil vacío).** Falso positivo del snapshot de accesibilidad.
  Comprobado con Playwright `is_mobile=True, has_touch=True` (iPhone 390x844): el
  dashboard renderiza contadores, microciclo, semana actual y sesiones. 

### Verificado
- `bunx tsc -b --force` → 0 errores.
- `bunx vitest run` → **79/79 pass**.
- `bun run build` → ok. `bunx pm2 restart web-app` → online en :4200, sin errores nuevos
  en logs (solo el aviso conocido de Resend con correos `example.com`).
- E2E Playwright (Chrome, móvil real): login, dashboard renderizado, aria-labels del
  BottomNav `['Inicio','Calendario','Nueva sesión','Equipos','Perfil']`, y la página 404.
- Datos de prueba del E2E (usuario 28 `e2etmp8899`, equipo 40, sesión 169) eliminados.
  Quedan 6 usuarios y 6 equipos, los mismos de antes.

---

## Ronda 11/08/2026 — Auditoría externa "CoachHub_v2_Auditoria_Completa_GitHub_Live"

> **Aviso importante:** el informe audita el commit `8f6bc14` (06/08/2026). Desde ahí
> había 8 commits, por lo que **11 de sus hallazgos ya estaban corregidos** en el código
> actual (ver "Descartado por ser falso").

### Aplicado
- **S-01 (fuerza bruta en login/registro).** `api/lib/rate-limit.ts` reescrito como
  limitador genérico con dos buckets: `IMPORT` (10 req/60 s, importación Google Forms) y
  `AUTH` (10 intentos/15 min por IP). Nuevas funciones `checkAuthRateLimit`,
  `recordAuthFailure`, `clearAuthFailures`, `__resetRateLimits` (tests) y purga periódica
  de claves caducadas.
  - `POST /api/auth/login`: solo cuenta los intentos **fallidos**; un login correcto
    llama a `clearAuthFailures`, así un usuario legítimo nunca se autobloquea.
  - `POST /api/auth/register`: cuenta **cada** intento (limita la creación masiva).
  - Respuesta `429` con cabecera `Retry-After` y mensaje en castellano. IP tomada de
    `X-Forwarded-For` → `X-Real-IP` → `"unknown"`.
- **Cascade de valoraciones en `DELETE /api/teams/:id`** (hallazgo propio, no del informe):
  al borrar un equipo quedaban huérfanos `evaluation_values`, `evaluation_sessions` y
  `evaluation_tests`. Ahora se borran dentro del mismo `db.batch` atómico.
- **F-0074 parcial.** `uniqueIndex("attendance_session_player_unique")` en `attendance`
  (sustituye al índice no único) + `onConflictDoNothing` en `POST /api/attendance/:sessionId/init`,
  que ya no puede duplicar filas si se llama dos veces.
- **S-08 (filtro de mes en memoria).** `sessions.ts`: helper `monthRange()` y filtros
  `gte`/`lte` en SQL en `GET /` y `GET /all-teams`; fuera los `.filter(s => s.date.startsWith(month))`.
- **F-0059 (permisos en `PlayersPage`).** `canEdit` derivado de `team.role`
  (owner/editor). Se ocultan a los `viewer`: botón de añadir del Topbar y del empty
  state, Editar/Eliminar ficha, "+ Nueva" lesión y las acciones de `InjuryCard`.
  "Exportar ficha en PDF" sigue visible para viewer (intencionado).
- **Q-03 / Q-04 / Q-13 (duplicados).** Nuevo `web/lib/dates.ts` con `formatDateES`,
  `formatDateShortES`, `formatWeekdayDateES`, `formatFullDateES` y `formatDateNumeric`.
  Migrados `EvaluationsPage`, `PlayersPage`, `CalendarPage`, `MatchPage` y `SessionPage`;
  eliminadas 6 copias locales de formateadores de fecha. `TeamSessionsPage` deja de tener
  su propio `hexToRgba` (sin guard de hex inválido) y usa el de `lib/sessionTypes`.
  Eliminado también `capFirst` de `lib/sessionTypes.ts`: quedó sin ningún uso al centralizar
  el formateo de fechas (su capitalización vive ahora dentro de `lib/dates.ts`).

### Descartado por ser FALSO (ya estaba arreglado antes de esta ronda)
S-02 (existe `team_members_team_user_unique`), S-03 (`authTokens.expiresAt` existe),
S-04 (`teams_share_code_unique` + `teams_import_token_unique`), S-05 (ya valida
`data:application/pdf`), S-06 (ya usa `db.batch` atómico), S-07 (purga implementada),
Q-01 (los 3 "ficheros muertos" no existen), Q-09 (`SESSION_TYPE_OPTIONS` ya centralizado),
BE-019/BE-020 y F-0064/F-0070/F-0075 (IDOR de miembros ya validado con `teamId`, cascade
de matches ya presente, null-check presente, los 8 índices FK ya existen).

### Descartado por criterio
- **LIVE-P01 / LIVE-P02.** `auth/me` se llama en un `useEffect(…, [])`, una sola vez.
  No hay `window.location.href` ni `<a href="/">`: la navegación es SPA con wouter. Las
  "5-6 llamadas" que midió el auditor son de su bot recargando la página.
- **LIVE-U01.** La "X" para miércoles es correcta en castellano. **No tocar.**
- **LIVE-U02.** Su bot inyecta valores en los inputs sin disparar eventos de React.
- **Q-02** (partir ficheros >800 líneas) y **Q-06 / Q-07** (unificar `lucide-react` vs
  `<Icon>`, Tailwind vs CSS vars): riesgo alto o puramente cosmético.
- **Q-08 (`labelStyle`/`inputStyle` duplicados).** Las 9 definiciones **no** son
  idénticas: varían `letterSpacing` (.06 vs .07) y el `marginTop`, y los `inputStyle` de
  `NewSessionPage`/`NewMatchPage` son distintos. Unificarlas cambiaría el aspecto visual.

### Verificado
- `bunx tsc -b --force` → 0 errores. `bunx vitest run` → **85/85** (6 tests nuevos del
  rate limit de auth). `bun run build` → ok. `bunx pm2 restart web-app` → online en :4200.
- `bun run db:push` aplicado y comprobado en Turso: existe
  `attendance_session_player_unique` (UNIQUE sobre `session_id, player_id`) y ya no está
  `attendance_session_player_idx`.
- Rate limit con curl: 10×401 y el 11º → `429` + `Retry-After: 899`; otra IP sigue en 401;
  un login correcto limpia la cuota (después admite otros 10 fallos).
- `GET /api/sessions?teamId&month`: agosto devuelve la sesión, julio vacío, sin `month`
  igual que antes.
- Cascade: equipo con jugadora + prueba + jornada + valor → `DELETE` devuelve **200** y en
  la BD no queda ninguna fila huérfana de las 6 tablas comprobadas.
- Datos de prueba eliminados: quedan **6 usuarios** y los equipos originales.

## Fix: el modal de "Nueva prueba física" perdía el foco a cada tecla (11/08/2026)

**Síntoma reportado:** al escribir la unidad de medida solo entraba una letra y el cursor
saltaba al campo de encima ("Nombre de la prueba").

**Causa:** `ModalShell` (EvaluationsPage) tenía `useEffect(…, [onClose])` y `onClose` se pasa
como función inline (`() => { setShowTestModal(false); setEditTest(null); }`), así que cambiaba
de identidad en **cada** render. Cada pulsación actualizaba `testForm` → nuevo render → el
efecto se desmontaba y su cleanup ejecutaba `prevFocus?.focus?.()`. Y `prevFocus` se capturaba
*dentro* del efecto, cuando el `autoFocus` del input "Nombre" ya había movido el foco ahí →
el cursor volvía al campo Nombre y la siguiente letra se escribía en él.

**Arreglo:** `onCloseRef` (ref actualizado en cada render) para que el efecto de teclado y
trampa de foco tenga dependencias `[]` y se monte una sola vez. `prevFocus` pasa a capturarse
durante el primer render (`openerRef`), que es cuando `document.activeElement` sigue siendo el
botón que abrió el modal, así que al cerrar el foco vuelve donde debe.

**Verificado con Playwright**, escribiendo tecla a tecla en los 3 inputs:
- Antes del fix: `name='Salto verticalmon contramovimiento'`, `unit='c'`, `desc='C'`.
- Después: `name='Salto vertical'`, `unit='cm'`, `desc='Con contramovimiento'`, y la prueba
  se guarda con su unidad.
- `tsc -b --force` limpio, 85/85 tests, `build` ok. Datos de prueba borrados de la BD.

## Fix: "Error de conexión" al iniciar sesión en el dominio publicado (14/08/2026)

**Síntoma reportado:** varios usuarios (César, id 35) no podían entrar: al pulsar
"Iniciar sesión" salía **"Error de conexión"**. En local y en la preview funcionaba bien.

**Diagnóstico.** `POST /api/auth/login` en el dominio publicado devolvía
`500 Internal Server Error` con cuerpo de **texto plano** (no JSON), de forma reproducible.
Se descartó, con pruebas contra el live:
- El deploy sirve el código más reciente (`{}` en el login → el 400 exacto del código actual).
- La BD funciona: `POST /register` con username existente → 409 (ese endpoint hace el mismo
  `SELECT` sobre `users` que el login), y un registro nuevo → 201 escribiendo en Turso.
- bcrypt funciona (el registro hashea con coste 12 sin problema).
- No es timeout ni caída del proceso: el 500 llega en 0,3-0,6 s y el resto de endpoints
  responden bien inmediatamente antes y después.
- Los logs no son accesibles: el deploy publicado no es este sandbox (pm2 queda vacío).

**Prueba decisiva:** se registró un usuario temporal en el live y se probó a entrar.
- Contraseña **correcta** → `200` con token. ✅
- Contraseña **incorrecta** → `500` texto plano. ❌

Es decir, solo se rompía la rama de fallo, la que responde **401**. Ampliando la prueba:

| Petición | Deploy publicado | Local / preview |
|---|---|---|
| `GET /api/auth/me` sin token (401) | **401 JSON** ✅ | 401 ✅ |
| `GET /api/teams` sin token (401) | **401 JSON** ✅ | 401 ✅ |
| `POST /api/auth/login` credenciales malas (401) | **500 texto plano** ❌ | 401 ✅ |
| `POST /api/auth/change-password` sin token (401) | **500 texto plano** ❌ | 401 ✅ |
| `POST /api/sessions` sin token (401) | **500 texto plano** ❌ | 401 ✅ |
| `PUT` / `DELETE /api/teams/1` sin token (401) | **500 texto plano** ❌ | 401 ✅ |
| `POST` con respuesta 200 / 400 / 404 / 409 | correcto ✅ | correcto ✅ |

**Causa raíz:** el proxy que hay delante de la app en el dominio publicado convierte
**cualquier respuesta 401 de una petición no-GET** en un `500 Internal Server Error` de texto
plano. No es código nuestro (el mismo commit y la misma BD dan 401 en local y en la preview) y
`onError` de Hono nunca se ejecuta, porque el 500 no lo genera la app. Encaja con el
comportamiento clásico de un proxy que interpreta el 401 como un desafío de autenticación e
intenta reintentar la petición, con el cuerpo ya consumido.

Efecto en el frontend: `LoginPage` hace `await res.json()` sobre `"Internal Server Error"`,
eso lanza una excepción y el `catch` pinta **"Error de conexión"** en vez de
"Credenciales incorrectas". Lo mismo pasaba con la sesión caducada en cualquier POST/PUT/DELETE.

**Arreglo (`src/api/index.ts`):** middleware global que, tras ejecutar la ruta, si la respuesta
es 401 y el método no es GET/HEAD, la reescribe a **400** (que el proxy sí respeta) manteniendo
el mismo cuerpo JSON y añadiendo `unauthorized: true` y la cabecera `X-Auth-Status: 401`.
En GET no se toca nada. No hacía falta cambiar el frontend: ni `LoginPage` ni `authFetchJson`
discriminan por código, solo leen `body.error`, así que ahora se ve el mensaje real.

**Extra:** `POST /api/auth/forgot-password` no tenía cuota. Cualquiera que conociese un email
registrado podía inundar de correos a su dueño (de hecho durante el diagnóstico se envió un
correo de recuperación no solicitado a la cuenta de Raúl). Ahora usa el mismo bucket AUTH
(10 intentos / 15 min por IP) contando todos los intentos.

**Verificado en local tras el fix:** login con contraseña mala → `400` +
`{"error":"Credenciales incorrectas","unauthorized":true}` + `X-Auth-Status: 401`;
`POST /api/teams` sin token → 400 con `unauthorized: true`; `GET /api/teams` y
`GET /api/auth/me` siguen dando 401 JSON; login correcto → 200 con token; `/api/health` ok.
`tsc -b --force` limpio, 85/85 tests, `build` ok, pm2 sin errores. Tokens de recuperación
pendientes borrados y usuarios de sondeo eliminados de Turso (quedan los 8 legítimos).

## Fix: "Error de conexión" al pedir el correo de recuperación (14/08/2026)

**Síntoma:** César pulsaba "He olvidado mi contraseña" y salía "Error de conexión".

**Causa raíz (la de verdad):** la cuenta de **Resend está en modo prueba**. El remitente es
`onboarding@resend.dev` (sin dominio propio verificado) y en ese modo Resend **solo acepta
enviar a la dirección del titular de la cuenta** (`01raul.emi@gmail.com`). Comprobado llamando
directamente a la API de Resend:
- a `01raul.emi@gmail.com` → `200`
- a `pozolainezce@gmail.com` (César) → `403 validation_error`: *"You can only send testing
  emails to your own email address (01raul.emi@gmail.com). To send emails to other recipients,
  please verify a domain at resend.com/domains"*

Consecuencia: **ningún usuario que no sea Raúl puede recibir el correo de recuperación**, ni el
de bienvenida al registrarse (ese es no bloqueante y falla en silencio).

**Segundo fallo, encadenado:** al fallar el envío, `/forgot-password` devuelve
`502 {"error":"No se pudo enviar el correo. Inténtalo más tarde."}`. En el dominio publicado el
proxy también se come los **5xx** de la app y los sustituye por `error code: 502` en texto
plano (cuerpo de Cloudflare) → `res.json()` peta en el frontend → "Error de conexión" en vez
del mensaje real. Mismo patrón que el 401 de ayer.

**Arreglo (`src/api/index.ts`):** el middleware del workaround se amplía: además del 401,
cualquier **5xx** de la app en una petición no-GET se reescribe a `400` conservando el cuerpo
JSON y añadiendo `X-App-Status: <código original>`. Verificado en local: forgot-password a un
email ajeno → `400` + `{"error":"No se pudo enviar el correo. Inténtalo más tarde."}` +
`X-App-Status: 502`.

**Pendiente (requiere acción del usuario):** para que la recuperación de contraseña funcione
de verdad para los demás usuarios hay que verificar un dominio en resend.com/domains y cambiar
`EMAIL_FROM` en `.env` a una dirección de ese dominio. Mientras tanto solo llegan correos a
`01raul.emi@gmail.com`.

## Fix: en móvil no se veía Asistencia / Anotaciones / Lesiones de la sesión (14/08/2026)

**Síntoma:** al abrir una sesión desde el iPhone no aparecía la barra para editar
asistencia, anotaciones ni lesiones. En iPad y PC sí.

**Causa (medida, no intuida):** en 390×844, `SessionPage` usaba `height: 100vh` en su rama
móvil, dentro de un `<main>` que ya reservaba `paddingBottom: 70`. Resultado: la página medía
`scrollHeight = 914` con `innerHeight = 844` y la barra del cajón caía en `top 801 → bottom 845`,
justo detrás de la `BottomNav` (fija, `bottom: 0`, alto 62, `z-index: 200`, ocupa 782→844).
Es decir, el control existía pero quedaba tapado y fuera del área visible.

**Arreglo:**
- Nuevo `src/web/lib/layout.ts` con `BOTTOM_NAV_HEIGHT = 62`,
  `BOTTOM_NAV_SPACE = calc(62px + env(safe-area-inset-bottom, 0px))` y
  `MOBILE_SCREEN_HEIGHT = calc(100dvh - BOTTOM_NAV_SPACE)`.
- `SessionPage` usa `MOBILE_SCREEN_HEIGHT` en vez de `100vh`.
- `app.tsx` usa `BOTTOM_NAV_SPACE` en vez del `70` suelto (safe area del iPhone incluida).
- El cajón pasa de `60vh` a `60dvh`, gana un asa gris (36×4) pulsable y el texto sube de
  10px/400 a 11px/600; alto colapsado 44 → 54 para que se pueda pulsar con el pulgar.

**Verificado con Playwright (390×844, `is_mobile`, `has_touch`):** `scrollHeight = 844`, barra
en `top 739 → bottom 783`, por encima de la nav. Al pulsar "Asistencia" el cajón abre a 506px
con los desplegables Presente/Ausente editables; "Anotaciones" y "Lesiones" también abren.
Regresión en `/`, `/calendar`, `/teams`, `/profile`, `/teams/1/players`: `navTop: 782` y 0
errores de JS. `tsc -b --force` limpio, 85/85 tests, `build` ok, pm2 sin errores.

## Contraseña provisional de César (14/08/2026)

Como los correos de recuperación no pueden salir hasta tener dominio verificado en Resend, se
le fijó la contraseña a mano en Turso: usuario `cesar` (id 35, `pozolainezce@gmail.com`),
contraseña **`Cesar-Balonmano-2026`**, hash bcrypt coste 12, `bcrypt.compare` → true. Se
borraron sus tokens de reset pendientes. Login real contra el dominio publicado → HTTP 200 con
token. Debe cambiarla desde su perfil.

## Valoraciones: acceso desde la navegación y varios ejercicios por sesión (17/08/2026)

**Petición:** que «Valoraciones» tenga su propio icono en la navegación (sin entrar por el
equipo) y que una sesión de valoración pueda incluir varios ejercicios distintos, eligiéndolos
al crearla y pudiendo añadir o quitar después.

**Navegación:**
- `Sidebar.tsx`: item «Valoraciones» (`PATHS.chart`), activo con `/evaluations` y
  `…/evaluations`; el match de «Equipos» excluye ahora `/evaluations`.
- `BottomNav.tsx`: **fuera el FAB `+` central** (las sesiones se crean desde el calendario o
  desde el equipo) y en su hueco «Valorac.». Cinco items iguales, `fontSize: 9.5`, icono 20.
- `app.tsx`: ruta `/evaluations` sin `teamId`. La página resuelve el equipo con
  `routeTeamId ?? último usado (localStorage: coachhub:lastEvaluationsTeamId) ?? primero` y
  muestra un `<select aria-label="Equipo">` cuando hay más de uno.
- La vista por defecto de la página pasa de «Pruebas» a «Registrar».

**Varios ejercicios por sesión (esquema):**
- `evaluation_tests.session_id` (nullable): si viene relleno el ejercicio es **puntual**, solo de
  esa jornada, y **no** sale en el catálogo (`GET /tests` filtra `isNull(sessionId)`).
- `evaluation_sessions.title` (notNull, default ""): título tipo «Test inicial pretemporada».
- Tabla nueva `evaluation_session_tests` (unique `session_id + test_id`): qué ejercicios entran
  en cada jornada.
- **Compatibilidad**: si una jornada no tiene enlaces (las creadas antes de este cambio),
  `testsBySession()` devuelve todo el catálogo activo, como funcionaba hasta ahora. Al quitar un
  ejercicio de una jornada sin enlaces se materializan primero los del catálogo menos ese.

**API (`routes/evaluations.ts`):** `POST /sessions` acepta `title` y `testIds`; `POST /tests`
acepta `sessionId` (puntual) o `attachToSession`; `POST /sessions/:id/tests` y
`DELETE /sessions/:id/tests/:testId`; `GET /sessions` devuelve los `tests` de cada jornada;
`PUT /values/batch` valida contra los ejercicios **de esa jornada**, no contra todo el catálogo;
`DELETE /sessions/:id` borra valores → enlaces → ejercicios puntuales → jornada;
`GET /history` devuelve también `tests` para que el CSV pueda nombrar los puntuales.

**UI:** modal «Nueva evaluación» con título, fecha, notas, checkboxes del catálogo
(premarcados) y `ExerciseDraftForm` para crear ejercicios en el momento eligiendo si van al
catálogo o solo a esa sesión. Modal nuevo «Ejercicios de la evaluación» (botón «Ejercicios (n)»
en la cabecera) para añadir del catálogo, crear uno nuevo o quitar, avisando de que al quitar se
borran los valores de esa jornada. En móvil, conmutador **Por ejercicio / Por jugador**: el
primero recorre el equipo con un solo ejercicio (lo natural en pista). La Comparativa sigue
usando solo el catálogo: los ejercicios puntuales no son comparables entre jornadas.

**Verificado:** `db:push` aplicado a la Turso del usuario; `tsc -b --force` limpio; 89/89 tests
(4 nuevos de `sessionLabel`); `build` ok. Playwright en escritorio: icono en la barra, entrada
por `/evaluations` con el último equipo y persistencia tras recargar, alta con título + 1 del
catálogo + 1 puntual, añadir y quitar ejercicio (los valores del quitado se borran, los del
resto se conservan), CSV con la columna del ejercicio puntual. En móvil 390×844: barra inferior
con 5 items sin FAB, cabecera de jornada en una línea, los dos modos de registro guardando.
Jornada creada sin `testIds` → sigue mostrando el catálogo completo (compatibilidad).
`scripts/cleanup_test.mjs` ampliado con `evaluation_session_tests` (sin él saltaba la FK).

## Sesiones: subir foto además de PDF (20/08/2026)

**Petición:** poder adjuntar una foto (pizarra, cuaderno) en vez de un PDF en los apartados
de sesión de pista y sesión de físico.

**Cómo:** no hay campos nuevos en la base de datos. La foto se guarda en el mismo campo
`pdfData` / `physicalPdfData` como data URL, y el tipo se deduce del propio prefijo del data
URL (`data:image/...` vs `data:application/pdf`). Las sesiones antiguas sin prefijo reconocible
se siguen tratando como PDF.

**`src/web/lib/sessionFiles.ts` (nuevo):** `SESSION_FILE_ACCEPT`, `sessionFileKind()`,
`sessionFileLabel()`, `isImageFile()`, `isHeicFile()`, `validateSessionFile()`, `scaledSize()`
y `readSessionFile()`. Las fotos se reescalan en el navegador (canvas) al lado más largo de
2000px y se recomprimen a JPEG 0.82 antes de guardarlas: una foto de móvil de 5-8MB en base64
reventaría el límite de 4MB del backend (`MAX_BASE64_FIELD_BYTES`). Se queda el original si el
reescalado no lo mejora.

**HEIC/HEIF:** se rechaza con un mensaje que explica cómo cambiar el iPhone a «Más compatible»,
porque ni el navegador ni el canvas lo saben decodificar. Al no incluir HEIC en el `accept`, el
selector de fotos de iOS suele entregar ya un JPG convertido.

**UI:** `NewSessionPage` acepta PDF y foto en los dos bloques (arrastrar o clic), con miniatura
del adjunto; etiquetas «Sesión de Pista (PDF o foto)» y «Preparación Física (PDF o foto,
opcional)». `SessionPage`: el visor pinta `<img>` para fotos y mantiene el `<iframe>` para PDF,
botón «Subir PDF o foto» / «Cambiar archivo», errores de subida avisados y `uploadingPdf`
reflejado también al cambiar de archivo.

**Verificado:** `tsc -b --force` limpio; 103/103 tests (14 nuevos de `sessionFiles`); `build`
ok. Playwright escritorio: `accept` correcto, miniatura en el formulario, sesión guardada con
`data:image/jpeg`, foto de 4000x3000 (326KB) guardada en 68KB, visor con `<img>` y sin iframe,
PDF en la pestaña de físico sigue con iframe, 0 errores JS. Móvil 390x844: la foto se ve a
ancho completo (fondo oscuro, no blanco). `scripts/cleanup_test.mjs` ejecutado.

## Sesiones: ver todas las páginas del PDF en móvil (27/08/2026)

**Problema:** desde el móvil el visor de PDF de una sesión solo mostraba la primera página, sin
posibilidad de llegar a las demás.

**Causa:** el visor usaba `<iframe src="data:application/pdf;...">`. En escritorio eso abre el
visor nativo del navegador (con scroll, zoom, imprimir), pero en móvil no: Safari de iOS trata
un PDF embebido como una previsualización estática (pinta la primera página y no deja hacer
scroll dentro del iframe) y Chrome de Android no tiene visor embebido.

**Solución:** en móvil se renderiza el PDF con pdf.js a `<canvas>`, una página por canvas
apiladas verticalmente, y el scroll lo hace el contenedor normal, que sí funciona con el dedo.
En escritorio se mantiene el `<iframe>` porque el visor nativo es mejor (zoom, imprimir,
descargar). La rama de foto (`sessionFileKind() === "image"`) no cambia.

**`src/web/components/PdfPages.tsx` (nuevo):** `loadPdfjs()` importa `pdfjs-dist` con `import()`
dinámico para que sus ~400KB no entren en el bundle inicial (solo se descargan al abrir una
sesión con PDF) y fija el worker como asset propio de Vite (`pdf.worker.min.mjs?url`), no desde
un CDN, para que funcione sin conexión a terceros. Detalles que importan:
- El `devicePixelRatio` se limita a 2: a 3x (iPhone) un PDF de varias páginas agota la memoria
  del navegador y Safari mata la pestaña.
- Cada canvas fija su `aspectRatio` con el viewport de la página antes de pintar, para que el
  scroll no salte mientras se renderiza.
- Al cambiar el ancho (girar el móvil) se cancela el `render()` anterior: pdf.js no admite dos
  renders solapados sobre el mismo canvas. Se sigue el ancho con `ResizeObserver`.
- Al desmontar se llama a `destroy()` de la tarea de carga para liberar worker y memoria.
- Badge «N / total» abajo a la derecha de cada página cuando hay más de una, para saber por
  dónde vas. Si el PDF no se puede abrir, se ofrece enlace de descarga.

**Verificado:** `tsc -b --force` sin errores nuevos; 103/103 tests; `build` ok (el worker se
emite como asset). Playwright móvil 390x844 con un PDF de 3 páginas: 3 canvas, badges «1 / 3»,
«2 / 3» y «3 / 3», scroll hasta la última página (scrollHeight 1671 sobre 560 visibles), 0
errores JS. Escritorio 1440x1000: sigue con `<iframe>` y sin canvas. `cleanup_test.mjs` ejecutado.

## Sesiones: arreglar que el PDF no cargaba en móvil (28/08/2026)

**Problema:** tras pasar el visor de móvil a pdf.js, en el móvil de verdad el PDF no cargaba
(se quedaba en «Cargando PDF…»), aunque en las pruebas con Chromium emulado funcionaba.

**Causa:** dos cosas propias del navegador real, que Chromium de escritorio no reproduce:
1. Se importaba la compilación **moderna** de `pdfjs-dist` v6, que usa APIs muy recientes como
   `Promise.withResolvers` (Safari solo la trae desde la 17.4). En un iPhone o iPad con iOS algo
   más antiguo el módulo ni arranca, así que no había PDF que pintar.
2. El worker se resolvía con `import("pdfjs-dist/build/pdf.worker.min.mjs?url")`. Eso hace que la
   URL del worker dependa de cómo Vite empaquete node_modules y cambie entre desarrollo, vista
   previa y producción; si no resuelve, pdf.js se queda esperando.

**Solución:**
- Se importa la compilación **legacy** (`pdfjs-dist/legacy/build/pdf.mjs`), transpilada y con
  polyfills, que sí funciona en Safari antiguo.
- El worker se sirve como fichero estático propio: `packages/web/public/pdf.worker.min.mjs`
  (copiado de `node_modules/pdfjs-dist/legacy/build/`), y `workerSrc` apunta a la URL fija
  `/pdf.worker.min.mjs`. Misma URL en dev, en vista previa y en producción, sin CDN.
  **Al actualizar pdfjs-dist hay que volver a copiar ese fichero** (queda anotado en el componente).
- Si aun así falla, el mensaje de error muestra el motivo real debajo del enlace de descarga,
  para poder distinguir si es el worker, la memoria o el propio fichero.

**Verificado:** `tsc -b --force` sin errores nuevos; 103/103 tests; `build` ok;
`GET /pdf.worker.min.mjs` responde 200 (1,3 MB). Playwright móvil 390x844 con un PDF de 3
páginas: 3 canvas, badges «1 / 3», «2 / 3» y «3 / 3», 0 errores JS. Escritorio: sigue con
`<iframe>`. `cleanup_test.mjs` ejecutado.

## Sesiones: el PDF no cargaba en el iPhone por el content-type del worker (28/08/2026)

**Síntoma:** en Chrome del iPhone (iOS 17) el visor mostraba «No se pudo abrir el PDF» con el
motivo «Setting up fake worker failed: "Importing a module script failed."».

**Causa:** el worker estaba en `public/pdf.worker.min.mjs`, y el servidor **no le pone cabecera
`content-type` a los ficheros `.mjs`** (comprobado con curl en producción: los `.js` de `assets/`
llegan con `text/javascript;charset=utf-8`, el `.mjs` llega sin cabecera). WebKit —o sea, todos los
navegadores del iPhone, incluido Chrome— se niega a importar un módulo que no llegue como
`text/javascript`. Al no poder crear el worker, pdf.js intentaba el «fake worker» (importar el
mismo fichero en el hilo principal) y fallaba por lo mismo, así que no llegaba a pintar nada.

**Solución:** el fichero se llama ahora `public/pdf.worker.min.js` (misma copia del build legacy de
pdfjs-dist, solo cambia la extensión) y `WORKER_URL` apunta a `/pdf.worker.min.js`. Con `.js` el
servidor manda `text/javascript` y el worker arranca. Queda anotado en el componente para que al
actualizar pdfjs-dist se vuelva a copiar **renombrando a `.js`**.

**Verificado:** `tsc -b --force` sin errores nuevos; 103/103 tests; `build` ok; Playwright móvil
con PDF de 3 páginas sigue en verde (3 canvas, badges 1/3-3/3, 0 errores JS).

## Sesiones: el PDF seguia sin cargar en el iPhone (module workers) (28/08/2026)

**Sintoma:** tras el arreglo del `.js` el iPhone seguia mostrando «No se pudo abrir el PDF» con el
mismo motivo «Setting up fake worker failed: "Importing a module script failed."». Con curl se
comprobó que en producción `/pdf.worker.min.js` responde 200 con `text/javascript;charset=utf-8`,
o sea que el content-type ya no era el problema.

**Causa real:** leyendo `pdfjs-dist/legacy/build/pdf.mjs` (`PDFWorker#initialize`), pdf.js crea el
worker **siempre** con `new Worker(url, { type: "module" })`. Los "module workers" **no existen en
WKWebView**, que es el motor de todos los navegadores del iPhone (Safari y también Chrome). Al
fallar, pdf.js cae a su «fake worker», que hace un `import()` dinámico del mismo módulo en el hilo
principal, y falla por lo mismo. Ninguna de las dos vías podía funcionar en iOS.

**Solución:**
- El worker se genera ahora como **script clásico** (formato IIFE, sin import/export) con esbuild:
  `cd packages/web && bunx esbuild node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs --bundle
  --format=iife --minify --target=es2017 --outfile=public/pdf.worker.min.js`.
  Queda anotado en `PdfPages.tsx` para cuando se actualice pdfjs-dist.
- `PdfPages` crea el Worker a mano (`new Worker(WORKER_URL)`, **sin** `type: "module"`) y se lo pasa
  a pdf.js con `new pdfjs.PDFWorker({ port })` → `getDocument({ worker })`. Así se saltan las dos
  rutas rotas. Si crear el Worker fallara, queda `workerSrc` como respaldo.
- El Worker se crea **uno por documento** (no uno global) para que abrir la sesión de pista y la de
  físico a la vez no se pisen, y se termina en la limpieza del efecto después de destruir el
  documento.
- Salida de emergencia: si aun así falla, el estado de error muestra un botón grande **«Abrir el
  PDF»** que genera un blob URL y lo abre en una pestaña nueva (visor nativo de iOS, todas las
  páginas), además del enlace de descarga y del motivo del error en texto pequeño.

**Verificado:** `tsc -b --force` sin errores nuevos; 103/103 tests; `build` ok;
`GET /pdf.worker.min.js` responde 200 con `text/javascript`. Playwright móvil 390x844 con PDF de 3
páginas: 3 canvas, badges 1/3-3/3, 0 errores JS, y scroll hasta la última página. Escritorio sigue
con `<iframe>`. Ojo: Chromium emulando móvil **no** reproduce el fallo del iPhone (sí soporta module
workers), la validación final la hace Raúl en su iPhone tras publicar.

## Sesiones: el visor ya no se queda colgado en «Cargando PDF…» (28/08/2026)

**Sintoma:** en el iPhone el visor se quedaba indefinidamente en «Cargando PDF…». Al pasarle a
pdf.js un Worker propio por `port`, si ese Worker no arranca **pdf.js no rechaza la promesa nunca**:
no hay error que mostrar y la pantalla se queda esperando para siempre.

**Solución (en `PdfPages.tsx`):**
- Se escucha el evento `error` del Worker: si se cae al arrancar, se muestra el motivo real en
  pantalla en vez de esperar.
- Temporizador de 15 s: si no hay documento, se pasa al estado de error con «Tiempo de espera
  agotado» (más el mensaje del worker si lo hubo). Ya nunca se queda colgado.
- A los 4 s de espera aparece un botón **«Abrir el PDF aparte»** debajo de «Cargando PDF…», para no
  tener que esperar el timeout: abre el PDF con el visor nativo del sistema (blob URL).
- Los temporizadores se limpian al cargar el documento, al fallar y al desmontar.

**Nota:** intentar compilar el worker con `--target=safari13` no es viable (esbuild no sabe
transpilar 676 sitios del código de pdf.js), así que el worker sigue en `--target=es2017`.

**Verificado:** `tsc -b --force` sin errores nuevos; 103/103 tests; `build` ok.

## Sesiones: pdf.js en el hilo principal para que el PDF se vea en el iPhone (28/08/2026)

**Sintoma:** tras pasar a un Worker clasico, en el iPhone de Raúl el visor mostraba «No se pudo abrir
el PDF aquí dentro — El worker de pdf.js falló: el worker no arrancó». Es decir: en ese WebKit no
arranca **ningún** Worker, ni clásico ni de módulo. Con eso, las dos rutas que usa pdf.js por defecto
(module worker y «fake worker» con `import()` dinámico) están cerradas.

**Solución (en `PdfPages.tsx`):**
- Leyendo `pdf.mjs` (líneas ~22419 y ~22532-22550) se confirma que si existe
  `globalThis.pdfjsWorker.WorkerMessageHandler`, pdf.js **no crea Worker ni hace `import()`**: usa
  ese handler y trabaja en el hilo principal. Es la única vía viable en WKWebView.
- Se genera un segundo bundle del worker que se expone como variable global y se carga con una
  etiqueta `<script>` normal (`loadMainThreadHandler()`, promesa cacheada, se resetea si falla).
- El efecto de carga hace dos intentos: primero `openWithWorker()` (Worker clásico + `PDFWorker({
  port })`, plazo de 6 s y escucha del evento `error`) y, si falla, `openOnMainThread()`, que carga
  el script y llama a `getDocument({ data })` sin worker. En el segundo intento se regeneran los
  bytes del PDF, porque pdf.js transfiere el ArrayBuffer al worker y el primero queda vacío.
- A los 5 s de espera sigue apareciendo el botón «Abrir el PDF aparte», y el estado de error mantiene
  el motivo real en texto pequeño gris (incluye `(worker: <motivo>)`): es la herramienta de
  diagnóstico si vuelve a fallar.

**Los dos bundles del worker** (regenerar al actualizar `pdfjs-dist`), desde `packages/web`:
```
bunx esbuild node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs --bundle --format=iife \
  --minify --target=es2017 --outfile=public/pdf.worker.min.js
bunx esbuild node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs --bundle --format=iife \
  --global-name=pdfjsWorker --minify --target=es2017 --outfile=public/pdf.worker.main.js
```
`--target=safari13` no es viable (esbuild da 676 errores sobre el código de pdf.js).

**Verificado:** `tsc -b --force` sin errores en `PdfPages`; 103/103 tests; `build` ok. Playwright
móvil con PDF de 3 páginas: 3 canvas, badges 1/3-3/3, 0 errores, y también **abortando el worker a
propósito** (camino del hilo principal) → 3 canvas y 0 errores. Escritorio sigue con `<iframe>`.
