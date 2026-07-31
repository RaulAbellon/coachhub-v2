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

const TABLES = [
  "users",
  "password_reset_tokens",
  "teams",
  "team_members",
  "sessions",
  "annotations",
  "players",
  "player_injuries",
  "player_incidents",
  "attendance",
  "matches",
  "match_callups",
  "match_documents",
  // auth_tokens NO se incluye a propósito: son sesiones temporales, no datos reales.
];

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
