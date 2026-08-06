export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
      <div className="section-label">{children}</div>
      {right}
    </div>
  );
}

export function LinkAction({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--accent)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Panel con lista de filas separadas por borde. */
export default function Panel({ children, empty }: { children?: React.ReactNode; empty?: string }) {
  const hasChildren = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {hasChildren ? (
        children
      ) : (
        <div style={{ padding: "22px 14px", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          {empty ?? "Nada por aquí todavía."}
        </div>
      )}
    </div>
  );
}

export function PanelRow({
  children,
  first,
  onClick,
}: {
  children: React.ReactNode;
  first?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={onClick ? "row-hover" : undefined}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderTop: first ? "none" : "1px solid var(--border)",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {children}
    </div>
  );
}
