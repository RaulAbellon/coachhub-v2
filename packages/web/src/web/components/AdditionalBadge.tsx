import { ADDITIONAL_COLOR, ADDITIONAL_DIM, ADDITIONAL_LABEL } from "../lib/additional";

/** Etiqueta "Adicional" para jugadores que suben de categoría inferior. */
export function AdditionalBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      title="Jugador adicional (sube de categoría inferior)"
      style={{
        display: "inline-flex", alignItems: "center", flexShrink: 0,
        padding: compact ? "1px 6px" : "2px 8px",
        fontSize: compact ? 10 : 11, fontWeight: 700,
        letterSpacing: "0.03em", lineHeight: 1.4,
        borderRadius: 6,
        color: ADDITIONAL_COLOR,
        background: ADDITIONAL_DIM,
        border: `1px solid ${ADDITIONAL_COLOR}55`,
        whiteSpace: "nowrap",
      }}
    >
      {ADDITIONAL_LABEL}
    </span>
  );
}
