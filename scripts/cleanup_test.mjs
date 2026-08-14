// Borra los usuarios de prueba (username tipo t<epoch>) y todo lo suyo.
import { createClient } from "@libsql/client";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);

const db = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });

const users = await db.execute(
  "SELECT id, username FROM users WHERE username GLOB 't[0-9]*' OR username GLOB 'ev[0-9]*' OR username GLOB 'vw[0-9]*' OR username GLOB 'rl_test_*' OR username GLOB 'rl_e2e_*' OR username GLOB 'live_probe_*' OR username GLOB 'fp_[0-9]*'",
);
console.log("usuarios de prueba:", users.rows.map(r => r.username));
if (users.rows.length === 0) process.exit(0);
const uids = users.rows.map(r => Number(r.id));

const teams = await db.execute({
  sql: `SELECT DISTINCT team_id FROM team_members WHERE user_id IN (${uids.map(() => "?").join(",")})`,
  args: uids,
});
const tids = teams.rows.map(r => Number(r.team_id));
console.log("equipos:", tids);

const q = async (sql, args = []) => (await db.execute({ sql, args })).rowsAffected;

if (tids.length) {
  const ph = tids.map(() => "?").join(",");
  const players = await db.execute({ sql: `SELECT id FROM players WHERE team_id IN (${ph})`, args: tids });
  const pids = players.rows.map(r => Number(r.id));
  const sess = await db.execute({ sql: `SELECT id FROM sessions WHERE team_id IN (${ph})`, args: tids });
  const sids = sess.rows.map(r => Number(r.id));
  const mts = await db.execute({ sql: `SELECT id FROM matches WHERE team_id IN (${ph})`, args: tids });
  const mids = mts.rows.map(r => Number(r.id));

  if (sids.length) {
    const s = sids.map(() => "?").join(",");
    console.log("annotations", await q(`DELETE FROM annotations WHERE session_id IN (${s})`, sids));
    console.log("attendance(s)", await q(`DELETE FROM attendance WHERE session_id IN (${s})`, sids));
  }
  if (pids.length) {
    const s = pids.map(() => "?").join(",");
    console.log("attendance(p)", await q(`DELETE FROM attendance WHERE player_id IN (${s})`, pids));
    console.log("injuries", await q(`DELETE FROM player_injuries WHERE player_id IN (${s})`, pids));
    console.log("incidents", await q(`DELETE FROM player_incidents WHERE player_id IN (${s})`, pids));
    console.log("callups(p)", await q(`DELETE FROM match_callups WHERE player_id IN (${s})`, pids));
    console.log("customvals", await q(`DELETE FROM player_custom_values WHERE player_id IN (${s})`, pids));
  }
  if (mids.length) {
    const s = mids.map(() => "?").join(",");
    console.log("callups(m)", await q(`DELETE FROM match_callups WHERE match_id IN (${s})`, mids));
    console.log("matchdocs", await q(`DELETE FROM match_documents WHERE match_id IN (${s})`, mids));
  }
  // Valoraciones físicas
  const evs = await db.execute({ sql: `SELECT id FROM evaluation_sessions WHERE team_id IN (${ph})`, args: tids });
  const evids = evs.rows.map(r => Number(r.id));
  if (evids.length) {
    const s = evids.map(() => "?").join(",");
    console.log("evalvalues", await q(`DELETE FROM evaluation_values WHERE session_id IN (${s})`, evids));
  }
  console.log("evalsessions", await q(`DELETE FROM evaluation_sessions WHERE team_id IN (${ph})`, tids));
  console.log("evaltests", await q(`DELETE FROM evaluation_tests WHERE team_id IN (${ph})`, tids));
  console.log("matches", await q(`DELETE FROM matches WHERE team_id IN (${ph})`, tids));
  console.log("players", await q(`DELETE FROM players WHERE team_id IN (${ph})`, tids));
  console.log("sessions", await q(`DELETE FROM sessions WHERE team_id IN (${ph})`, tids));
  console.log("formfields", await q(`DELETE FROM team_form_fields WHERE team_id IN (${ph})`, tids));
  console.log("members", await q(`DELETE FROM team_members WHERE team_id IN (${ph})`, tids));
  console.log("teams", await q(`DELETE FROM teams WHERE id IN (${ph})`, tids));
}

const u = uids.map(() => "?").join(",");
console.log("authtokens", await q(`DELETE FROM auth_tokens WHERE user_id IN (${u})`, uids));
console.log("resettokens", await q(`DELETE FROM password_reset_tokens WHERE user_id IN (${u})`, uids));
console.log("members(u)", await q(`DELETE FROM team_members WHERE user_id IN (${u})`, uids));
console.log("users", await q(`DELETE FROM users WHERE id IN (${u})`, uids));

const rest = await db.execute("SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM teams) t, (SELECT COUNT(*) FROM sessions) s, (SELECT COUNT(*) FROM players) p, (SELECT COUNT(*) FROM matches) m");
console.log("quedan:", rest.rows[0]);
