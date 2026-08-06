import { useState } from "react";
import { useLocation } from "wouter";
import { CoachHubMark } from "../components/CoachHubLogo";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (newPassword !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo restablecer la contraseña");
        return;
      }
      setDone(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-primary)", padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <CoachHubMark size={60} radius={18} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            CoachHub
          </h1>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {!token ? (
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                Enlace no válido
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>
                Falta el código de recuperación. Solicita un nuevo enlace desde la pantalla de inicio.
              </p>
              <button className="btn-gradient" onClick={() => navigate("/login")}
                style={{ width: "100%", justifyContent: "center" }}>
                Ir a iniciar sesión
              </button>
            </div>
          ) : done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                Contraseña actualizada
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>
                Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
              <button className="btn-gradient" onClick={() => navigate("/login")}
                style={{ width: "100%", justifyContent: "center" }}>
                Iniciar sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                Nueva contraseña
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 18 }}>
                Elige una nueva contraseña para tu cuenta.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Nueva contraseña</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres" autoComplete="new-password" required />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Repetir contraseña</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password" required />
              </div>

              {error && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                  color: "#ef4444", fontSize: 13, marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn-gradient" disabled={loading || !newPassword || !confirm}
                style={{ width: "100%", height: 42, fontSize: 14, opacity: loading || !newPassword || !confirm ? 0.6 : 1 }}>
                {loading ? "..." : "Guardar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "var(--text-secondary)", marginBottom: 6,
  textTransform: "uppercase", letterSpacing: "0.06em",
};
