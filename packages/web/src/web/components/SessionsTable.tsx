import Panel from "./Panel";
import { sessionStyle, shortDate } from "../lib/sessionTypes";
import { useIsMobile } from "../hooks/useIsMobile";

export interface SessionRowData {
  id: number;
  title: string;
  teamName: string;
  sessionType: string;
  date: string;
}

export default function SessionsTable({
  sessions,
  onOpen,
}: {
  sessions: SessionRowData[];
  onOpen: (id: number) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <Panel empty="Todavía no hay sesiones registradas.">
      {sessions.map((s, i) => {
        const st = sessionStyle(s.sessionType);
        return (
          <div
            key={s.id}
            className="row-hover"
            onClick={() => onOpen(s.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 14px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            <span style={{ width: 6, height: 32, borderRadius: 3, background: st.color, flexShrink: 0 }} />
            {!isMobile && (
              <span
                className="badge"
                style={{ background: st.bg, color: st.color, minWidth: 44, textAlign: "center" }}
              >
                {st.label}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontWeight: 500,
                  marginTop: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.teamName}
              </div>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                minWidth: isMobile ? undefined : 80,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {shortDate(s.date)}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}
