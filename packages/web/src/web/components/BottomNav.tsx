import { Link, useLocation } from "wouter";
import { useIsMobile } from "../hooks/useIsMobile";

const CalendarIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const TeamsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const ProfileIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const leftItems = [
  { path: "/", label: "Calendario", icon: <CalendarIcon /> },
  { path: "/teams", label: "Equipos", icon: <TeamsIcon /> },
];

const rightItems = [
  { path: "/profile", label: "Perfil", icon: <ProfileIcon /> },
];

export default function BottomNav() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  const NavLink = ({ item }: { item: { path: string; label: string; icon: React.ReactElement } }) => {
    const isActive = location === item.path;
    return (
      <Link key={item.path} href={item.path} style={{ flex: 1, display: "flex", textDecoration: "none" }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          flex: 1,
          color: isActive ? "var(--accent)" : "var(--text-secondary)",
          fontSize: 10,
          fontWeight: isActive ? 600 : 400,
          transition: "color 0.15s",
        }}>
          {item.icon}
          {item.label}
        </div>
      </Link>
    );
  };

  return (
    <nav style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      height: 60,
      background: "var(--bg-secondary)",
      borderTop: "1px solid var(--border)",
      zIndex: 200,
      display: "flex",
      flexDirection: "row",
      alignItems: "stretch",
    }}>
      {leftItems.map(item => <NavLink key={item.path} item={item} />)}

      {/* Center FAB - Nueva Sesión */}
      <Link href="/sessions/new" style={{ flex: 1, display: "flex", textDecoration: "none" }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          gap: 3,
        }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#000",
          }}>
            <PlusIcon />
          </div>
        </div>
      </Link>

      {rightItems.map(item => <NavLink key={item.path} item={item} />)}
    </nav>
  );
}
