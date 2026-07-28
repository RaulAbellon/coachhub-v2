import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface Team {
  id: number;
  name: string;
  category: string;
  color: string;
  role?: string;
}

function TeamAvatar({ team }: { team: Team }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 11,
      background: `${team.color}22`, border: `1px solid ${team.color}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: team.color, flexShrink: 0,
    }}>
      <UsersIcon />
    </div>
  );
}

export default function ProfilePage() {
  const { user, token, logout } = useAuth();
  const [, navigate] = useLocation();

  const { data } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await authFetch("/api/teams", {}, token);
      return res.json();
    },
    enabled: !!user,
  });

  const teams: Team[] = data?.teams ?? [];
  const managedTeams = teams.filter(t => t.role === "owner");
  const otherTeams = teams.filter(t => t.role !== "owner");

  return (
    <div className="fade-in" style={{ padding: "24px 16px 40px", maxWidth: 640, margin: "0 auto", boxSizing: "border-box", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 4 }}>
          Perfil
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Tu cuenta y equipos
        </p>
      </div>

      {/* Account card */}
      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "var(--accent-dim)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", fontSize: 22, fontWeight: 700, flexShrink: 0,
        }}>
          {user?.displayName?.slice(0, 1).toUpperCase() ?? "?"}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.displayName}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            @{user?.username}
          </div>
        </div>
      </div>

      {/* Managed teams */}
      <div style={{ marginBottom: 20 }}>
        <div className="label-caps" style={{ marginBottom: 10, paddingLeft: 4 }}>
          Equipos que gestiono
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          {managedTeams.length === 0 ? (
            <div style={{ padding: "18px 16px", fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
              No gestionas ningún equipo todavía
            </div>
          ) : (
            managedTeams.map((team, i) => (
              <div
                key={team.id}
                className="card-hover"
                onClick={() => navigate(`/teams/${team.id}/players`)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <TeamAvatar team={team} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {team.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {team.category || "Sin categoría"}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}><ChevronIcon /></span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Other teams (shared with me) */}
      {otherTeams.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="label-caps" style={{ marginBottom: 10, paddingLeft: 4 }}>
            Compartidos conmigo
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            {otherTeams.map((team, i) => (
              <div
                key={team.id}
                className="card-hover"
                onClick={() => navigate(`/teams/${team.id}/players`)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <TeamAvatar team={team} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {team.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                    {team.role === "editor" ? "Editor" : "Visor"}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}><ChevronIcon /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={logout}
        className="btn-danger"
        style={{ width: "100%", justifyContent: "center", padding: "13px 0", marginTop: 8 }}
      >
        <LogoutIcon />
        Cerrar sesión
      </button>
    </div>
  );
}
