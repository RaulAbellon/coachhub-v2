
## [2026-08-03] Formulario editable + PDF resumen del jugador
Plan aprobado con 6 correcciones (IDs integer no UUID, mapeo por etiqueta normalizada
en backend en vez de [key] en el título del form, compat payload plano, BUILTIN_FIELDS
constante + seed lazy, flechas en vez de drag&drop, % asistencia sobre sesiones con
lista pasada). ZIP por lotes aplazado.

- [x] Backup DB (backups/coachhub-backup-2026-08-03.json)
- [x] Schema: team_form_fields + player_custom_values (+ unique indexes)
- [x] lib/form-fields.ts (BUILTIN_FIELDS, normalizeLabel, coerceValue, seed lazy)
- [x] routes/form-fields.ts (CRUD, reorder, copy-from, reset-builtin)
- [x] players.ts: PUT /:id/custom-values, GET /:id/summary, import dinámico, GET / con fields
- [ ] db:push
- [ ] Frontend TeamsPage: config de campos + Apps Script dinámico
- [ ] Frontend PlayersPage: render/edición campos mezclados
- [ ] PDF resumen del jugador (jsPDF)
- [ ] build + verificar + commit + push
