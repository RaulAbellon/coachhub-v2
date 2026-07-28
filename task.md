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
