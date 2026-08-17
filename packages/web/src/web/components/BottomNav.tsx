import { Link, useLocation } from "wouter";
import { useIsMobile } from "../hooks/useIsMobile";
import { Icon, PATHS } from "./icons";

// Sin FAB central: las sesiones se crean desde el calendario o desde el equipo,
// así que ese hueco lo ocupa Valoraciones.
const items = [
  { path: "/", label: "Inicio", icon: PATHS.dashboard, match: (l: string) => l === "/" },
  { path: "/calendar", label: "Calendario", icon: PATHS.calendar, match: (l: string) => l === "/calendar" },
  {
    path: "/evaluations",
    label: "Valorac.",
    icon: PATHS.chart,
    match: (l: string) => l === "/evaluations" || l.endsWith("/evaluations"),
  },
  {
    path: "/teams",
    label: "Equipos",
    icon: PATHS.teams,
    match: (l: string) => l.startsWith("/teams") && !l.endsWith("/evaluations"),
  },
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
            fontSize: 9.5,
            fontWeight: isActive ? 700 : 500,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            transition: "color 0.15s",
          }}
        >
          <Icon d={item.icon} size={20} />
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
      {items.map((item) => (
        <NavLink key={item.path} item={item} />
      ))}
    </nav>
  );
}
