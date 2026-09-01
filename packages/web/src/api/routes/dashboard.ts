import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { attendancePct, countsForAttendance } from "../lib/attendance";

/**
 * Agregados para la vista Dashboard (rediseño Dashboard Pro).
 * Un único endpoint para no disparar 5 llamadas desde el frontend.
 */
export const dashboard = new Hono().get("/", async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: "No autorizado" }, 401);

  const memberships = await db
    .select({ teamId: schema.teamMembers.teamId, role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, user.userId));

  if (memberships.length === 0) {
    return c.json({
      stats: { players: 0, sessions: 0, matches: 0, attendance: null },
      teams: [],
      upcoming: [],
      recent: [],
    });
  }

  const teamIds = memberships.map((m) => m.teamId);
  const roleOf = (id: number) => memberships.find((m) => m.teamId === id)?.role ?? "viewer";

  const [allTeams, allPlayers, allSessions, allMatches] = await Promise.all([
    db.select().from(schema.teams).where(inArray(schema.teams.id, teamIds)),
    db
      .select({ id: schema.players.id, teamId: schema.players.teamId })
      .from(schema.players)
      .where(inArray(schema.players.teamId, teamIds)),
    db
      .select({
        id: schema.sessions.id,
        teamId: schema.sessions.teamId,
        title: schema.sessions.title,
        date: schema.sessions.date,
        duration: schema.sessions.duration,
        sessionType: schema.sessions.sessionType,
        microcycle: schema.sessions.microcycle,
      })
      .from(schema.sessions)
      .where(inArray(schema.sessions.teamId, teamIds)),
    db
      .select({
        id: schema.matches.id,
        teamId: schema.matches.teamId,
        date: schema.matches.date,
        time: schema.matches.time,
        opponent: schema.matches.opponent,
        homeAway: schema.matches.homeAway,
        venue: schema.matches.venue,
        goalsFor: schema.matches.goalsFor,
        goalsAgainst: schema.matches.goalsAgainst,
      })
      .from(schema.matches)
      .where(inArray(schema.matches.teamId, teamIds)),
  ]);

  // Asistencia: filas de attendance de las sesiones de estos equipos
  const sessionIds = allSessions.map((s) => s.id);
  const attRows = sessionIds.length
    ? await db
        .select({
          sessionId: schema.attendance.sessionId,
          status: schema.attendance.status,
        })
        .from(schema.attendance)
        .where(inArray(schema.attendance.sessionId, sessionIds))
    : [];

  // El porcentaje mide la asistencia real: solo cuentan las presencias y las
  // ausencias SIN justificar. Las justificadas y las lesiones no entran ni en el
  // numerador ni en el denominador (no penalizan a la jugadora).
  const sessionTeam = new Map(allSessions.map((s) => [s.id, s.teamId]));
  const attByTeam = new Map<number, { present: number; total: number }>();
  let globalPresent = 0;
  let globalTotal = 0;
  for (const row of attRows) {
    const teamId = sessionTeam.get(row.sessionId);
    if (teamId == null) continue;
    if (!countsForAttendance(row.status)) continue;
    const acc = attByTeam.get(teamId) ?? { present: 0, total: 0 };
    acc.total += 1;
    globalTotal += 1;
    if (row.status === "present") {
      acc.present += 1;
      globalPresent += 1;
    }
    attByTeam.set(teamId, acc);
  }
  const pct = attendancePct;

  const teamsOut = allTeams
    .map((t) => {
      const acc = attByTeam.get(t.id);
      return {
        id: t.id,
        name: t.name,
        category: t.category,
        color: t.color,
        gender: t.gender,
        logoData: t.logoData,
        role: roleOf(t.id),
        players: allPlayers.filter((p) => p.teamId === t.id).length,
        sessions: allSessions.filter((s) => s.teamId === t.id).length,
        matches: allMatches.filter((m) => m.teamId === t.id).length,
        attendance: acc ? pct(acc.present, acc.total) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const teamName = (id: number | null) => allTeams.find((t) => t.id === id)?.name ?? "";
  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD en hora local

  const upcoming = [
    ...allSessions
      .filter((s) => s.date >= todayStr)
      .map((s) => ({
        kind: "session" as const,
        id: s.id,
        title: s.title,
        teamName: teamName(s.teamId),
        date: s.date,
        time: "",
        meta: `${s.duration ?? 0} min · MC ${s.microcycle}`,
        sessionType: s.sessionType,
      })),
    ...allMatches
      .filter((m) => m.date >= todayStr)
      .map((m) => ({
        kind: "match" as const,
        id: m.id,
        title: m.opponent ? `vs ${m.opponent}` : "Partido por definir",
        teamName: teamName(m.teamId),
        date: m.date,
        time: m.time ?? "",
        meta: [m.time ? `${m.time}h` : null, m.homeAway === "home" ? "Local" : "Visitante", m.venue || null]
          .filter(Boolean)
          .join(" · "),
        sessionType: "",
      })),
  ]
    .sort((a, b) => (a.date === b.date ? (a.time || "").localeCompare(b.time || "") : a.date.localeCompare(b.date)))
    .slice(0, 6);

  const recent = allSessions
    .filter((s) => s.date <= todayStr)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, 6)
    .map((s) => ({
      id: s.id,
      title: s.title,
      teamName: teamName(s.teamId),
      sessionType: s.sessionType,
      date: s.date,
    }));

  return c.json({
    stats: {
      players: allPlayers.length,
      sessions: allSessions.length,
      matches: allMatches.length,
      attendance: pct(globalPresent, globalTotal),
    },
    teams: teamsOut,
    upcoming,
    recent,
  });
});
