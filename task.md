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
