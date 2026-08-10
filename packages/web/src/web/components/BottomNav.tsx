import { Link, useLocation } from "wouter";
import { useIsMobile } from "../hooks/useIsMobile";
import { Icon, PATHS } from "./icons";

const leftItems = [
  { path: "/", label: "Inicio", icon: PATHS.dashboard, match: (l: string) => l === "/" },
  { path: "/calendar", label: "Calendario", icon: PATHS.calendar, match: (l: string) => l === "/calendar" },
];

const rightItems = [
  { path: "/teams", label: "Equipos", icon: PATHS.teams, match: (l: string) => l.startsWith("/teams") },
  { path: "/profile", label: "Perfil", icon: PATHS.players, match: (l: string) => l === "/profile" },
];

export default function BottomNav() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  const NavLink = ({
    item,
  }: {
    item: { path: string; label: string; icon: string; match: (l: string) => boolean };
  }) => {
    const isActive = item.match(location);
    return (
      <Link
        href={item.path}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        style={{ flex: 1, display: "flex", textDecoration: "none" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            flex: 1,
            color: isActive ? "var(--accent)" : "var(--text-muted)",
            fontSize: 10,
            fontWeight: isActive ? 700 : 500,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            transition: "color 0.15s",
          }}
        >
          <Icon d={item.icon} size={21} />
          {item.label}
        </div>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegación principal"
      style={{
        position: "fixed",
        paddingBottom: "env(safe-area-inset-bottom)",
        bottom: 0,
        left: 0,
        right: 0,
        height: 62,
        background: "var(--bg-sidebar)",
        borderTop: "1px solid var(--border)",
        zIndex: 200,
        display: "flex",
        alignItems: "stretch",
      }}
    >
      {leftItems.map((item) => (
        <NavLink key={item.path} item={item} />
      ))}

      {/* FAB central — Nueva sesión */}
      <Link
        href="/sessions/new"
        aria-label="Nueva sesión"
        style={{ flex: 1, display: "flex", textDecoration: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "var(--accent-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px var(--accent-glow)",
            }}
          >
            <Icon d={PATHS.plus} size={22} color="#fff" strokeWidth={2.2} />
          </div>
        </div>
      </Link>

      {rightItems.map((item) => (
        <NavLink key={item.path} item={item} />
      ))}
    </nav>
  );
}
