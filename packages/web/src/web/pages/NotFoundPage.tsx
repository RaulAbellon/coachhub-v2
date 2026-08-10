import { useLocation } from "wouter";

/**
 * Pantalla 404 para el Switch autenticado.
 *
 * Antes, una URL inválida (un enlace roto, un equipo eliminado, un marcador
 * viejo) renderizaba la sidebar y el topbar con el área de contenido en blanco
 * y sin ninguna explicación. Ver F-001.
 */
export default function NotFoundPage() {
  const [, navigate] = useLocation();

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 48, fontWeight: 700, color: "var(--accent)", margin: 0 }}>404</p>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
        Esta página no existe
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0, maxWidth: 360 }}>
        Puede que el enlace esté roto o que el contenido se haya eliminado.
      </p>
      <button type="button" className="btn-accent" style={{ marginTop: 8 }} onClick={() => navigate("/")}>
        Volver al inicio
      </button>
    </div>
  );
}
