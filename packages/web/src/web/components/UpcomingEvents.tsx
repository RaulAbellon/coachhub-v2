import Panel, { PanelRow } from "./Panel";
import { hexToRgba, relativeTag, MATCH_COLOR } from "../lib/sessionTypes";

export interface UpcomingEvent {
  kind: "session" | "match";
  id: number;
  title: string;
  teamName: string;
  date: string;
  time: string;
  meta: string;
}

export default function UpcomingEvents({
  events,
  onOpen,
}: {
  events: UpcomingEvent[];
  onOpen: (e: UpcomingEvent) => void;
}) {
  return (
    <Panel empty="No hay nada programado próximamente.">
      {events.map((e, i) => {
        const color = e.kind === "match" ? MATCH_COLOR : "var(--accent)";
        const dotColor = e.kind === "match" ? MATCH_COLOR : "#22d3ee";
        const tag = relativeTag(e.date);
        return (
          <PanelRow key={`${e.kind}-${e.id}`} first={i === 0} onClick={() => onOpen(e)}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
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
                {e.title}
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
                {[e.teamName, e.meta].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span
              className="badge"
              style={{ background: hexToRgba(dotColor, 0.1), color, flexShrink: 0 }}
            >
              {tag}
            </span>
          </PanelRow>
        );
      })}
    </Panel>
  );
}
