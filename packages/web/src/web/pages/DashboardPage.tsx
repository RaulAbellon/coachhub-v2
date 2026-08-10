import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";
import Topbar from "../components/Topbar";
import StatsStrip, { StatCard } from "../components/StatsStrip";
import TeamCardCompact, { AddTeamCard, type TeamCardData } from "../components/TeamCardCompact";
import UpcomingEvents, { type UpcomingEvent } from "../components/UpcomingEvents";
import SessionsTable, { type SessionRowData } from "../components/SessionsTable";
import MicrocycleWidget from "../components/MicrocycleWidget";
import { SectionLabel, LinkAction } from "../components/Panel";
import { Icon, PATHS } from "../components/icons";
import { useIsMobile } from "../hooks/useIsMobile";

interface DashboardData {
  stats: { players: number; sessions: number; matches: number; attendance: number | null };
  teams: (TeamCardData & { role: string; matches: number })[];
  upcoming: UpcomingEvent[];
  recent: SessionRowData[];
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const isMobile = useIsMobile();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await authFetch("/api/dashboard", {}, token);
      return (await res.json()) as DashboardData;
    },
    enabled: !!user,
  });

  const stats = data?.stats;
  const teams = data?.teams ?? [];
  const canEdit = teams.some((t) => t.role === "owner" || t.role === "editor");

  const openEvent = (e: UpcomingEvent) =>
    navigate(e.kind === "match" ? `/matches/${e.id}` : `/sessions/${e.id}`);

  return (
    <>
      <Topbar
        crumbs={[{ label: "Dashboard" }]}
        actions={
          <>
            {canEdit && !isMobile && (
              <button className="btn-accent" onClick={() => navigate("/sessions/new")}>
                <Icon d={PATHS.plus} size={14} color="#000" strokeWidth={2.2} /> Sesión
              </button>
            )}
          </>
        }
      />

      <div className="page-body">
        <StatsStrip>
          <StatCard icon={PATHS.players} color="#22d3ee" value={stats?.players ?? 0} label="Jugadores" />
          <StatCard icon={PATHS.calendar} color="#a855f7" value={stats?.sessions ?? 0} label="Sesiones" />
          <StatCard icon={PATHS.matches} color="#fbbf24" value={stats?.matches ?? 0} label="Partidos" />
          <StatCard
            icon={PATHS.check}
            color="#22c55e"
            value={stats?.attendance == null ? "—" : `${stats.attendance}%`}
            label="Asistencia"
          />
        </StatsStrip>

        {/* Microciclo actual */}
        <div style={{ marginTop: 24 }}>
          <MicrocycleWidget />
        </div>

        <div className="two-col" style={{ marginTop: 24 }}>
          <section>
            <SectionLabel right={<LinkAction onClick={() => navigate("/teams")}>Ver todos</LinkAction>}>
              Equipos
            </SectionLabel>
            <div className="teams-strip">
              {teams.slice(0, 5).map((t) => (
                <TeamCardCompact key={t.id} team={t} onClick={() => navigate(`/teams/${t.id}/players`)} />
              ))}
              <AddTeamCard onClick={() => navigate("/teams?new=1")} />
            </div>
          </section>

          <section>
            <SectionLabel>Próximos eventos</SectionLabel>
            <UpcomingEvents events={data?.upcoming ?? []} onOpen={openEvent} />
          </section>
        </div>

        <section style={{ marginTop: 24 }}>
          <SectionLabel right={<LinkAction onClick={() => navigate("/calendar")}>Ver calendario</LinkAction>}>
            Sesiones recientes
          </SectionLabel>
          <SessionsTable sessions={data?.recent ?? []} onOpen={(id) => navigate(`/sessions/${id}`)} />
        </section>

        {isLoading && (
          <p style={{ marginTop: 20, fontSize: 12, color: "var(--text-muted)" }}>Cargando datos…</p>
        )}
      </div>
    </>
  );
}
