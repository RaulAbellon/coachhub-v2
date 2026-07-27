import { Link, useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import CoachHubLogo from "./CoachHubLogo";

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const TeamsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const HandballIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    <path d="M2 12h20"/>
  </svg>
);

const ProfileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const navItems = [
  { path: "/", label: "Calendario", icon: <CalendarIcon /> },
  { path: "/teams", label: "Equipos", icon: <TeamsIcon /> },
  { path: "/profile", label: "Perfil", icon: <ProfileIcon /> },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  if (isMobile) return null;

  return (
    <div style={{
      position: "fixed",
      left: 0, top: 0, bottom: 0,
      width: 240,
      background: "var(--bg-secondary)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{
        padding: "22px 20px 18px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CoachHubLogo size={38} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>CoachHub</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>Balonmano</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", padding: "6px 10px 8px" }}>
          Principal
        </div>
        {navItems.map(item => {
          const isActive = location === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderRadius: 10,
                marginBottom: 2,
                cursor: "pointer",
                background: isActive ? "var(--accent-dim)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                transition: "all 0.15s",
                borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
              >
                {item.icon}
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User info -> Profile */}
      {user && (
        <Link href="/profile">
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{user.username}</div>
            </div>
          </div>
        </Link>
      )}

      {/* New session button */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
        <Link href="/sessions/new">
          <div style={{
            background: "var(--accent)",
            color: "#0D1117",
            borderRadius: 10,
            padding: "11px 16px",
            textAlign: "center",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            letterSpacing: "0.01em",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--accent-hover)"}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "var(--accent)"}
          >
            <PlusIcon />
            Nueva Sesión
          </div>
        </Link>
      </div>
    </div>
  );
}
