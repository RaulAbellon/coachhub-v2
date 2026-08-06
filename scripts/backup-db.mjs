// CoachHub - Backup completo de la base de datos a JSON.
// Uso: node scripts/backup-db.mjs
// Lee DATABASE_URL y DATABASE_AUTH_TOKEN de .env
import { createClient } from "@libsql/client";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Cargar .env de forma sencilla
const env = {};
try {
  const raw = readFileSync(join(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const url = process.env.DATABASE_URL || env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN || env.DATABASE_AUTH_TOKEN;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const client = createClient({ url, authToken });

// Tablas: se descubren automáticamente del propio SQLite para que el backup no
// se quede desfasado cuando se añaden tablas nuevas al esquema.
const EXCLUDED = new Set([
  "auth_tokens",       // sesiones temporales, no son datos reales
  "__drizzle_migrations",
  "_litestream_seq",
  "_litestream_lock",
  "libsql_wasm_func_table",
]);

const tablesRes = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
);
const TABLES = tablesRes.rows
  .map((r) => String(r.name))
  .filter((n) => !EXCLUDED.has(n));

if (TABLES.length === 0) {
  console.error("No se encontró ninguna tabla en la base de datos. Abortando sin escribir el backup.");
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const outDir = join(root, "backups");
mkdirSync(outDir, { recursive: true });

const dump = { generatedAt: new Date().toISOString(), tables: {} };
let totalRows = 0;

for (const t of TABLES) {
  try {
    const res = await client.execute(`SELECT * FROM ${t}`);
    dump.tables[t] = res.rows.map((r) => ({ ...r }));
    totalRows += res.rows.length;
    console.log(`  ${t}: ${res.rows.length} filas`);
  } catch (e) {
    console.log(`  ${t}: ERROR (${e.message}) — omitida`);
    dump.tables[t] = [];
  }
}

const outFile = join(outDir, `coachhub-backup-${stamp}.json`);
writeFileSync(outFile, JSON.stringify(dump, null, 2));
console.log(`\nBackup guardado: ${outFile}`);
console.log(`Total: ${totalRows} filas en ${TABLES.length} tablas`);

// Si todas las tablas fallaron o la base está vacía, no dejamos pasar un backup vacío
// como si fuese correcto: mejor fallar y que el aviso llegue al usuario.
if (totalRows === 0) {
  console.error("\nAVISO: el backup no contiene ninguna fila. Revisa las credenciales de la base de datos.");
  process.exit(2);
}
