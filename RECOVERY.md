# CoachHub — Guía de recuperación del proyecto

Este documento existe para que **cualquier agente de IA (o persona)** pueda retomar este proyecto
desde cero, aunque la conversación/sandbox anterior se haya perdido por completo. El código y este
mismo documento son la fuente de verdad — no dependen de ninguna conversación de chat.

## 1. Qué es esto

CoachHub: app de gestión de equipos de balonmano (Expo iOS/iPad + web React). Ver `design.md`
para estilo visual y `task.md` para historial de features y estado de trabajo en curso.

## 2. Dónde vive cada cosa

| Componente | Dónde | Notas |
|---|---|---|
| Código | `github.com/RaulAbellon/coachhub-v2` (privado) | Fuente de verdad. Rama `main`. |
| Base de datos | Turso (libSQL), proyecto `coachhub-raul-abellon` | Persiste siempre, independiente del sandbox/chat. |
| Backups de datos | `backups/*.json` en el propio repo | Snapshot JSON de todas las tablas, versionado con git. |
| App publicada | URL de "Publish" de Runable (activa desde antes de esta recuperación) | No depende del sandbox de desarrollo. |
| Secretos (.env) | **NO están en git** (gitignored). Los tiene Raúl. | Ver sección 4. |

## 3. Cómo reconstruir el entorno de desarrollo desde cero

```bash
git clone https://<TOKEN>@github.com/RaulAbellon/coachhub-v2.git
cd coachhub-v2
cp .env.template .env
# Rellenar .env (ver sección 4)
bun install
bun run dev --port 4200   # o el puerto que toque
```

Para clonar un repo privado hace falta un GitHub Personal Access Token (scope `repo`),
generado en github.com/settings/tokens por Raúl.

## 4. Variables de entorno necesarias (`.env`)

```
DATABASE_URL=libsql://coachhub-raul-abellon.aws-eu-west-1.turso.io
DATABASE_AUTH_TOKEN=<token de Turso, lo tiene Raúl>
BETTER_AUTH_SECRET=<cualquier string aleatorio largo, se puede regenerar sin perder datos>
RESEND_API_KEY=<para emails de bienvenida / recuperación de contraseña — pedir a Raúl>
```

`AI_GATEWAY_*` y `AUTUMN_SECRET_KEY` no se usan actualmente en CoachHub — dejar vacíos.

**Importante:** `DATABASE_URL` y `DATABASE_AUTH_TOKEN` son las credenciales reales de producción.
Rotarlas (crear un token nuevo en Turso) invalida las antiguas — solo hacerlo si Raúl lo pide.

## 5. Reglas para no perder nada nunca

1. **Todo cambio de código se commitea y se pushea a GitHub al terminar cada sesión de trabajo.**
   Nunca dejar trabajo solo en el sandbox local — el sandbox es descartable, GitHub no.
2. **Nunca ejecutar cambios de esquema destructivos** (`DROP TABLE`, borrar columnas, etc.) sin
   confirmación explícita de Raúl, y sin backup previo (`node scripts/backup-db.mjs`).
3. **Antes de cualquier `db:push`** con cambios de esquema, correr el backup:
   ```bash
   node scripts/backup-db.mjs
   git add backups/ && git commit -m "backup antes de cambio de esquema" && git push
   ```
4. Hay un backup automático semanal programado (tarea programada de Runable) que corre
   `scripts/backup-db.mjs` y pushea el resultado a `backups/` en GitHub.
5. Mantener `task.md` actualizado con el estado real de lo que está hecho / pendiente / publicado,
   para que el siguiente agente sepa exactamente por dónde continuar.
6. La app publicada (URL de Publish) apunta siempre a la misma base de Turso — mientras esa URL
   siga activa, los usuarios finales nunca pierden datos, independientemente de lo que pase en el
   sandbox de desarrollo.

## 6. Si migras a otra IA / plataforma

Dale a la otra IA:
- La URL del repo de GitHub + un token de acceso.
- Este archivo (`RECOVERY.md`).
- Las variables de entorno de la sección 4 (pídeselas a Raúl directamente, no están en el repo).

Con eso tiene todo lo necesario para reconstruir el entorno y seguir trabajando sin perder nada.
