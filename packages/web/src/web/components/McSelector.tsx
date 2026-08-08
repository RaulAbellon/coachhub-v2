import { Icon, PATHS } from "./icons";

interface McSelectorProps {
  /** Microciclo activo, 1..totalMc. 0 = "Todos" (sin filtro). */
  activeMc: number;
  /** Callback al cambiar. Recibe 0 (Todos) o 1..totalMc. */
  onChange: (mc: number) => void;
  /** Número total de microciclos disponibles. */
  totalMc: number;
  /** Etiquetas a mostrar (labels[i] = número real del MC i+1). Por defecto 1..N. */
  labels?: number[];
  /** MC actual (1..totalMc), se marca con un punto para acceso rápido. */
  currentMc?: number;
  /** Mostrar botón "Todos". Default: true */
  showAll?: boolean;
  /** Layout compacto. Default: false */
  compact?: boolean;
}

/**
 * Selector de microciclos con pills segmentadas y flechas de navegación.
 * Reutilizable en el Topbar del Calendario y en el widget del Dashboard.
 */
export default function McSelector({
  activeMc,
  onChange,
  totalMc,
  labels,
  currentMc,
  showAll = true,
  compact = false,
}: McSelectorProps) {
  if (totalMc <= 0) return null;

  const goPrev = () => {
    if (activeMc === 0) onChange(totalMc);
    else if (activeMc > 1) onChange(activeMc - 1);
    else if (showAll) onChange(0);
  };
  const goNext = () => {
    if (activeMc === 0) onChange(1);
    else if (activeMc < totalMc) onChange(activeMc + 1);
    else if (showAll) onChange(0); // volver a "Todos"
  };

  const pills = Array.from({ length: totalMc }, (_, i) => i + 1);
  const btnBase = {
    height: compact ? 26 : 28,
    borderRadius: 7,
    border: "none",
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.15s ease",
  } as const;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        background: "var(--bg-surface, rgba(255,255,255,0.03))",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 3,
        flexShrink: 0,
      }}
    >
      <button
        onClick={goPrev}
        aria-label="Microciclo anterior"
        style={{
          ...btnBase,
          width: compact ? 26 : 28,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon d={PATHS.chevronLeft} size={13} color="var(--text-secondary)" />
      </button>

      <div style={{ display: "flex", gap: 2 }}>
        {pills.map((mc) => {
          const isActive = mc === activeMc;
          return (
            <button
              key={mc}
              onClick={() => onChange(mc)}
              aria-pressed={isActive}
              style={{
                ...btnBase,
                padding: `0 ${compact ? 8 : 10}px`,
                background: isActive ? "rgba(34,211,238,0.12)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontSize: compact ? 10 : 11,
                fontWeight: isActive ? 700 : 600,
                boxShadow: isActive ? "inset 0 0 0 1px rgba(34,211,238,0.3)" : "none",
                whiteSpace: "nowrap",
              }}
            >
              MC {labels?.[mc - 1] ?? mc}
              {mc === currentMc && (
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: isActive ? "var(--accent)" : "var(--text-secondary)",
                    marginLeft: 4,
                    verticalAlign: "middle",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {showAll && (
        <button
          onClick={() => onChange(0)}
          aria-pressed={activeMc === 0}
          style={{
            ...btnBase,
            padding: `0 ${compact ? 8 : 10}px`,
            background: activeMc === 0 ? "rgba(255,255,255,0.06)" : "transparent",
            color: activeMc === 0 ? "var(--text-primary)" : "var(--text-muted)",
            fontSize: compact ? 10 : 11,
            fontWeight: activeMc === 0 ? 700 : 600,
          }}
        >
          Todos
        </button>
      )}

      <button
        onClick={goNext}
        aria-label="Microciclo siguiente"
        style={{
          ...btnBase,
          width: compact ? 26 : 28,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon d={PATHS.chevronRight} size={13} color="var(--text-secondary)" />
      </button>
    </div>
  );
}
