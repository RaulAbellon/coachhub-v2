import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../lib/authFetch";

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface Team {
  id: number;
  name: string;
  category: string;
  color: string;
  role?: string;
}

function TeamAvatar({ team }: { team: Team }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 11,
      background: `${team.color}22`, border: `1px solid ${team.color}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: team.color, flexShrink: 0,
    }}>
      <UsersIcon />
    </div>
  );
}

export default function ProfilePage() {
  const { user, token, logout } = useAuth();
  const [, navigate] = useLocation();

  // Estado del formulario de cambio de contraseña
  const [showPwd, setShowPwd] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const resetPwdForm = () => {
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setPwdError(""); setPwdSuccess(false);
  };

  const handleChangePassword = async () => {
    setPwdError(""); setPwdSuccess(false);
    if (!currentPassword || !newPassword) {
      setPwdError("Rellena todos los campos");
      return;
    }
    if (newPassword.length < 6) {
      setPwdError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("Las contraseñas nuevas no coinciden");
      return;
    }
    setPwdSaving(true);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }, token);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar la contraseña");
      setPwdSuccess(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: any) {
      setPwdError(err.message);
    } finally {
      setPwdSaving(false);
    }
  };

  const { data } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await authFetch("/api/teams", {}, token);
      return res.json();
    },
    enabled: !!user,
  });

  const teams: Team[] = data?.teams ?? [];
  const managedTeams = teams.filter(t => t.role === "owner");
  const otherTeams = teams.filter(t => t.role !== "owner");

  return (
    <>
      <Topbar crumbs={[{ label: "Perfil" }]} />
    <div className="page-body" style={{ maxWidth: 680 }}>

      {/* Account card */}
      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "var(--accent-dim)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", fontSize: 22, fontWeight: 700, flexShrink: 0,
        }}>
          {user?.displayName?.slice(0, 1).toUpperCase() ?? "?"}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.displayName}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            @{user?.username}
          </div>
        </div>
      </div>

      {/* Managed teams */}
      <div style={{ marginBottom: 20 }}>
        <div className="label-caps" style={{ marginBottom: 10, paddingLeft: 4 }}>
          Equipos que gestiono
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          {managedTeams.length === 0 ? (
            <div style={{ padding: "18px 16px", fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
              No gestionas ningún equipo todavía
            </div>
          ) : (
            managedTeams.map((team, i) => (
              <div
                key={team.id}
                className="card-hover"
                onClick={() => navigate(`/teams/${team.id}/players`)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <TeamAvatar team={team} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {team.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {team.category || "Sin categoría"}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}><ChevronIcon /></span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Other teams (shared with me) */}
      {otherTeams.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="label-caps" style={{ marginBottom: 10, paddingLeft: 4 }}>
            Compartidos conmigo
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            {otherTeams.map((team, i) => (
              <div
                key={team.id}
                className="card-hover"
                onClick={() => navigate(`/teams/${team.id}/players`)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <TeamAvatar team={team} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {team.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                    {team.role === "editor" ? "Editor" : "Visor"}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}><ChevronIcon /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seguridad */}
      <div style={{ marginBottom: 20 }}>
        <div className="label-caps" style={{ marginBottom: 10, paddingLeft: 4 }}>
          Seguridad
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <div
            className="card-hover"
            onClick={() => {
              setShowPwd(v => {
                if (v) resetPwdForm();
                return !v;
              });
            }}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 11,
              background: "var(--accent-dim)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)", flexShrink: 0,
            }}>
              <LockIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                Cambiar contraseña
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Actualiza tu contraseña de acceso
              </div>
            </div>
            <span style={{ color: "var(--text-muted)", flexShrink: 0, transform: showPwd ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
              <ChevronIcon />
            </span>
          </div>

          {showPwd && (
            <div style={{ padding: "4px 16px 18px", borderTop: "1px solid var(--border)" }}>
              <div style={{ marginTop: 14, marginBottom: 12 }}>
                <label style={pwdLabelStyle}>Contraseña actual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={pwdInputStyle}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={pwdLabelStyle}>Nueva contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  style={pwdInputStyle}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={pwdLabelStyle}>Repetir nueva contraseña</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  style={pwdInputStyle}
                />
              </div>

              {pwdError && (
                <div style={{ fontSize: 13, color: "#F85149", marginBottom: 12 }}>
                  {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div style={{ fontSize: 13, color: "#22c55e", marginBottom: 12 }}>
                  Contraseña actualizada correctamente
                </div>
              )}

              <button
                onClick={handleChangePassword}
                disabled={pwdSaving}
                className="btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "12px 0", opacity: pwdSaving ? 0.6 : 1 }}
              >
                {pwdSaving ? "Guardando..." : "Guardar contraseña"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="btn-danger"
        style={{ width: "100%", justifyContent: "center", padding: "13px 0", marginTop: 8 }}
      >
        <LogoutIcon />
        Cerrar sesión
      </button>
    </div>
    </>
  );
}

const pwdLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

const pwdInputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 14,
  color: "var(--text-primary)",
  boxSizing: "border-box",
  outline: "none",
};
