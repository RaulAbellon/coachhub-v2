import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  userId: number;
  username: string;
  displayName: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

// F-0003 (ai_workflow/01_AUDIT_REPORT.yaml): la sesión ya no se persiste en
// localStorage (accesible por cualquier script, incluido uno inyectado por
// XSS). El backend fija una cookie HttpOnly+Secure+SameSite=Lax en
// login/register/logout; el navegador la adjunta solo, sin que este código
// pueda leerla. `token` se mantiene solo en memoria durante la sesión de la
// pestaña (útil para el fallback Authorization en authFetch), y la sesión se
// restaura al recargar consultando GET /api/auth/me, que valida la cookie.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch {
        // Sin conexión o servidor caído: se queda sin sesión, el usuario
        // tendrá que volver a intentarlo.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
