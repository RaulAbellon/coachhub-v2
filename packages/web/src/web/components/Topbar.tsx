import { Link } from "wouter";
import { useIsMobile } from "../hooks/useIsMobile";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Topbar fija de 56px (Dashboard Pro).
 * Izquierda: breadcrumb "CoachHub / … / Página actual" (el último crumb es el título).
 * Derecha: acciones de la página.
 * En móvil se simplifica a título + acciones.
 */
export default function Topbar({ crumbs, actions }: { crumbs: Crumb[]; actions?: React.ReactNode }) {
  const isMobile = useIsMobile();
  const last = crumbs[crumbs.length - 1];
  const rest = crumbs.slice(0, -1);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        height: 56,
        flexShrink: 0,
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: isMobile ? "0 16px" : "0 28px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--text-muted)",
          fontWeight: 500,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {!isMobile && (
          <>
            <Link href="/">
              <span style={{ cursor: "pointer" }}>CoachHub</span>
            </Link>
            <span style={{ opacity: 0.5 }}>/</span>
            {rest.map((c) => (
              <span key={c.label} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {c.href ? (
                  <Link href={c.href}>
                    <span
                      style={{
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 180,
                        display: "inline-block",
                      }}
                    >
                      {c.label}
                    </span>
                  </Link>
                ) : (
                  <span style={{ whiteSpace: "nowrap" }}>{c.label}</span>
                )}
                <span style={{ opacity: 0.5 }}>/</span>
              </span>
            ))}
          </>
        )}
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {last?.label ?? ""}
        </span>
      </div>

      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{actions}</div>
      )}
    </header>
  );
}

/** Toggle segmentado para vistas (ej. Dashboard | Calendario). */
export function ViewToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 2,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              padding: "5px 12px",
              borderRadius: 6,
              border: "none",
              background: active ? "var(--accent-dim)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
