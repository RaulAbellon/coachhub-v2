import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import CoachHubLogo from "../components/CoachHubLogo";

const ROLES = [
  { value: "entrenador", label: "Entrenador/a" },
  { value: "analista", label: "Analista" },
  { value: "preparador_fisico", label: "Preparador/a físico" },
  { value: "oficial", label: "Oficial" },
  { value: "delegado", label: "Delegado/a" },
  { value: "otro", label: "Otro" },
];

type Mode = "login" | "register" | "forgot";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [role, setRole] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setForgotSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo enviar el correo");
          return;
        }
        setForgotSent(true);
        return;
      }

      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: any = { username, password };
      if (mode === "register") {
        body.email = email;
        body.firstName = firstName;
        body.lastName = lastName;
        body.birthDate = birthDate;
        body.role = role;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error desconocido");
        return;
      }

      login(data.token, data.user);
      navigate("/");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    mode === "forgot"
      ? !!email
      : mode === "login"
      ? !!username && !!password
      : !!username && !!password && !!email && !!firstName && !!lastName && !!birthDate && !!role;

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-primary)",
      padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <CoachHubLogo size={64} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            CoachHub
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            Gestión de equipos de balonmano
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {/* Mode toggle (login / register) — oculto en modo forgot */}
          {mode !== "forgot" && (
            <div style={{ display: "flex", background: "var(--bg-secondary)", borderRadius: 10, padding: 3, marginBottom: 24, gap: 3 }}>
              {(["login", "register"] as const).map(m => (
                <button key={m} type="button" onClick={() => switchMode(m)} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: mode === m ? "var(--bg-card)" : "transparent",
                  color: mode === m ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: 13, fontWeight: mode === m ? 600 : 400,
                  cursor: "pointer", transition: "all 0.15s",
                  boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                }}>
                  {m === "login" ? "Iniciar sesión" : "Registrarse"}
                </button>
              ))}
            </div>
          )}

          {mode === "forgot" && forgotSent ? (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                Revisa tu correo
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
                Si <strong>{email}</strong> corresponde a una cuenta, te hemos enviado un enlace para
                restablecer la contraseña. Caduca en 1 hora.
              </p>
              <button type="button" className="btn-secondary" onClick={() => switchMode("login")}
                style={{ width: "100%", justifyContent: "center", padding: "12px 0" }}>
                Volver a iniciar sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {mode === "forgot" && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 18 }}>
                  Introduce el correo con el que te registraste y te enviaremos un enlace para crear una
                  nueva contraseña.
                </p>
              )}

              {mode === "register" && (
                <>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ marginBottom: 14, flex: 1 }}>
                      <label style={labelStyle}>Nombre</label>
                      <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nombre" required />
                    </div>
                    <div style={{ marginBottom: 14, flex: 1 }}>
                      <label style={labelStyle}>Apellidos</label>
                      <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Apellidos" required />
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Fecha de nacimiento</label>
                    <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} max={new Date().toISOString().split("T")[0]} required />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Rol</label>
                    <select value={role} onChange={e => setRole(e.target.value)} required
                      style={{
                        width: "100%", background: "var(--bg-secondary)", border: "1px solid var(--border)",
                        borderRadius: 10, padding: "11px 12px", fontSize: 14,
                        color: role ? "var(--text-primary)" : "var(--text-secondary)", boxSizing: "border-box",
                      }}>
                      <option value="" disabled>Selecciona tu rol</option>
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              {(mode === "register" || mode === "forgot") && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Correo electrónico</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="tucorreo@ejemplo.com" autoComplete="email" required />
                </div>
              )}

              {mode !== "forgot" && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Usuario</label>
                    <input value={username} onChange={e => setUsername(e.target.value)}
                      placeholder="nombre_usuario" autoComplete="username" required />
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Contraseña</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder={mode === "register" ? "Mínimo 6 caracteres" : "••••••••"}
                      autoComplete={mode === "login" ? "current-password" : "new-password"} required />
                  </div>
                </>
              )}

              {error && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(255,59,48,0.12)", border: "1px solid rgba(255,59,48,0.3)",
                  color: "#FF3B30", fontSize: 13, marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !canSubmit}
                style={{ width: "100%", opacity: loading || !canSubmit ? 0.6 : 1 }}
              >
                {loading ? "..." : mode === "login" ? "Entrar" : mode === "register" ? "Crear cuenta" : "Enviar enlace"}
              </button>

              {mode === "login" && (
                <button type="button" onClick={() => switchMode("forgot")}
                  style={{
                    width: "100%", background: "none", border: "none", marginTop: 16,
                    color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
                  }}>
                  ¿Olvidaste tu contraseña?
                </button>
              )}

              {mode === "forgot" && (
                <button type="button" onClick={() => switchMode("login")}
                  style={{
                    width: "100%", background: "none", border: "none", marginTop: 16,
                    color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
                  }}>
                  ← Volver a iniciar sesión
                </button>
              )}
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
