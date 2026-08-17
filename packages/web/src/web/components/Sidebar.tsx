import { Link, useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { CoachHubMark } from "./CoachHubLogo";
import { Icon, PATHS } from "./icons";

const navItems: { path: string; label: string; icon: string; match: (l: string) => boolean }[] = [
  { path: "/", label: "Dashboard", icon: PATHS.dashboard, match: (l) => l === "/" },
  { path: "/calendar", label: "Calendario", icon: PATHS.calendar, match: (l) => l === "/calendar" },
  {
    path: "/evaluations",
    label: "Valoraciones",
    icon: PATHS.chart,
    match: (l) => l === "/evaluations" || l.endsWith("/evaluations"),
  },
  {
    path: "/teams",
    label: "Equipos",
    icon: PATHS.teams,
    // Las valoraciones también viven bajo /teams/:id: si no se excluyen, se
    // marcarían los dos apartados a la vez.
    match: (l) => l.startsWith("/teams") && !l.endsWith("/evaluations"),
  },
  { path: "/profile", label: "Perfil", icon: PATHS.players, match: (l) => l === "/profile" },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  if (isMobile) return null;

  return (
    <aside
      className="sidebar"
      style={{
        position: "fixed",
        left: 0, top: 0, bottom: 0,
        width: 72,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 0",
        gap: 18,
        zIndex: 100,
      }}
    >
      <Link href="/" aria-label="CoachHub">
        <CoachHubMark size={44} radius={14} />
      </Link>

      <nav style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        {navItems.map((item) => {
          const isActive = item.match(location);
          return (
            <Link key={item.path} href={item.path} aria-label={item.label}>
              <div
                className="nav-item"
                style={{
                  position: "relative",
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  if (!isActive) e.currentTarget.style.color = "var(--text-secondary)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                  if (!isActive) e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      left: -14,
                      width: 3,
                      height: 24,
                      borderRadius: 2,
                      background: "var(--accent)",
                    }}
                  />
                )}
                <Icon d={item.icon} size={19} />
                <span className="nav-tip">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <Link href="/sessions/new" aria-label="Nueva sesión">
        <div
          className="nav-item"
          style={{
            position: "relative",
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "var(--accent-gradient)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px var(--accent-glow)",
            cursor: "pointer",
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <Icon d={PATHS.plus} size={20} color="#fff" strokeWidth={2.2} />
          <span className="nav-tip">Nueva sesión</span>
        </div>
      </Link>

      {user && (
        <Link href="/profile" aria-label="Perfil">
          <div
            className="nav-item"
            style={{
              position: "relative",
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {(user.displayName || user.username).slice(0, 1).toUpperCase()}
            <span className="nav-tip">{user.displayName || user.username}</span>
          </div>
        </Link>
      )}
    </aside>
  );
}
