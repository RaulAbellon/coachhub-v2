import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";
import { Provider } from "./components/provider";
import { useAuth } from "./context/AuthContext";
import { useIsMobile } from "./hooks/useIsMobile";
import CalendarPage from "./pages/CalendarPage";
import SessionPage from "./pages/SessionPage";
import NewSessionPage from "./pages/NewSessionPage";
import TeamsPage from "./pages/TeamsPage";
import TeamSessionsPage from "./pages/TeamSessionsPage";
import TeamMatchesPage from "./pages/TeamMatchesPage";
import NewMatchPage from "./pages/NewMatchPage";
import MatchPage from "./pages/MatchPage";
import PlayersPage from "./pages/PlayersPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user && location !== "/login") {
      navigate("/login");
    }
  }, [user, isLoading, location, navigate]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg-primary)" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cargando...</p>
      </div>
    );
  }

  return <>{children}</>;
}

function AppLayout() {
  const { user } = useAuth();
  const [location] = useLocation();
  const isMobile = useIsMobile();

  if (!user || location === "/login") {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Sidebar />
      <BottomNav />
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : 240, minHeight: "100vh", overflowY: "auto", paddingBottom: isMobile ? 70 : 0 }}>
        <Switch>
          <Route path="/" component={CalendarPage} />
          <Route path="/sessions/new" component={NewSessionPage} />
          <Route path="/sessions/:id">
            {(params) => <SessionPage id={params.id} />}
          </Route>
          <Route path="/teams" component={TeamsPage} />
          <Route path="/teams/:teamId/players">
            {(params) => <PlayersPage params={params} />}
          </Route>
          <Route path="/teams/:teamId/sessions">
            {() => <TeamSessionsPage />}
          </Route>
          <Route path="/teams/:teamId/matches">
            {() => <TeamMatchesPage />}
          </Route>
          <Route path="/matches/new" component={NewMatchPage} />
          <Route path="/matches/:id">
            {(params) => <MatchPage id={params.id} />}
          </Route>
          <Route path="/profile" component={ProfilePage} />
          <Route path="/login" component={LoginPage} />
        </Switch>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Provider>
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}
