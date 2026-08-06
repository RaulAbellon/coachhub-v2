// Generador del PDF resumen del jugador (datos de ficha + asistencia + convocatorias).
import { jsPDF } from "jspdf";
import { formatFieldValue, type FieldType } from "./formFields";

export type SummaryField = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  isBuiltin: boolean;
  mapsToColumn: string | null;
  value: unknown;
};

export type PlayerSummary = {
  player: {
    id: number;
    name: string;
    number: number | null;
    photoData: string | null;
    birthDate: string | null;
    isAdditional?: boolean;
  };
  team: { id: number; name: string; category: string | null; color?: string | null; logoData: string | null } | null;
  fields: SummaryField[];
  attendance: {
    summary: {
      totalRegistradas: number;
      asistidas: number;
      porcentaje: number | null;
      desglose: Record<string, number>;
    };
    detail: { date: string; title: string; sessionType: string; status: string }[];
  };
  callups: {
    summary: {
      totalConConvocatoria: number;
      convocado: number;
      noConvocado: number;
      porcentaje: number | null;
    };
    detail: { date: string; opponent: string; homeAway: string; called: boolean }[];
  };
  injuries: { zone?: string; description?: string; dateStart?: string; dateEnd?: string; resolved?: boolean }[];
  incidents: { type?: string; description?: string; date?: string }[];
  generatedAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  present: "Asistió",
  absent: "Ausente",
  justified: "Justificada",
  injured: "Lesionado",
};

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

function esDate(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "";
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return `${age} años`;
}

export type PdfRange = { from?: string; to?: string };

/** Construye el documento (útil para tests) sin descargarlo. */
export function buildPlayerPdf(summary: PlayerSummary, range?: PdfRange, accentHex = "#0891b2") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const accent = hexToRgb(accentHex);
  let y = 54;

  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text("CoachHub", margin, pageH - 30);
    const gen = new Date(summary.generatedAt);
    doc.text(
      `Generado el ${esDate(gen.toISOString().slice(0, 10))}`,
      pageW - margin,
      pageH - 30,
      { align: "right" },
    );
  };

  const ensure = (needed: number) => {
    if (y + needed > pageH - 60) {
      footer();
      doc.addPage();
      y = 54;
    }
  };

  const sectionTitle = (text: string) => {
    ensure(46);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(text.toUpperCase(), margin, y);
    y += 8;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 18;
  };

  // ── Cabecera ──
  const photo = summary.player.photoData;
  if (photo) {
    try { doc.addImage(photo, margin, y - 10, 54, 54); } catch { /* foto no válida */ }
  }
  const textX = photo ? margin + 68 : margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  const dorsal = summary.player.number != null ? `#${summary.player.number}  ` : "";
  doc.text(`${dorsal}${summary.player.name}`, textX, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  const sub = [summary.team?.name, summary.team?.category, summary.player.isAdditional ? "Jugador adicional" : ""]
    .filter(Boolean).join("  ·  ");
  doc.text(sub || "Ficha del jugador", textX, y + 28);
  y += 62;

  doc.setDrawColor(accent.r, accent.g, accent.b);
  doc.setLineWidth(2);
  doc.line(margin, y, pageW - margin, y);
  y += 24;

  if (range?.from || range?.to) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Periodo: ${range.from ? esDate(range.from) : "inicio"} - ${range.to ? esDate(range.to) : "hoy"}`,
      margin, y,
    );
    y += 20;
  }

  // ── Datos de la ficha ──
  sectionTitle("Datos de la ficha");

  const rows: [string, string][] = [];
  const age = calcAge(summary.player.birthDate);
  for (const f of summary.fields) {
    const value = formatFieldValue({ type: f.type }, f.value);
    if (!value) continue;
    if (f.key === "fecha_nac") {
      rows.push([f.label, age ? `${value}  (${age})` : value]);
      continue;
    }
    rows.push([f.label, value]);
  }

  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(150, 150, 150);
    doc.text("Sin datos registrados.", margin, y);
    y += 18;
  } else {
    const labelW = 170;
    const valueW = pageW - margin * 2 - labelW - 10;
    for (const [label, value] of rows) {
      const lines = doc.splitTextToSize(value, valueW) as string[];
      ensure(lines.length * 14 + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(110, 110, 110);
      doc.text(label, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(30, 30, 30);
      doc.text(lines, margin + labelW, y);
      y += lines.length * 14 + 4;
    }
  }
  y += 14;

  // ── Asistencia ──
  sectionTitle("Asistencia a entrenamientos");
  const att = summary.attendance.summary;

  if (att.totalRegistradas === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(150, 150, 150);
    doc.text("No hay sesiones con lista de asistencia pasada en este periodo.", margin, y);
    y += 20;
  } else {
    // Barra de porcentaje
    const pct = att.porcentaje ?? 0;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text(`${pct}%`, margin, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `${att.asistidas} de ${att.totalRegistradas} sesiones con lista pasada`,
      margin + 76, y - 2,
    );

    const barX = margin + 76;
    const barW = pageW - margin - barX;
    doc.setFillColor(235, 235, 235);
    doc.rect(barX, y + 2, barW, 8, "F");
    doc.setFillColor(accent.r, accent.g, accent.b);
    doc.rect(barX, y + 2, (barW * pct) / 100, 8, "F");
    y += 30;

    const d = att.desglose ?? {};
    const chips = [
      ["Asistió", d.present ?? 0],
      ["Ausente", d.absent ?? 0],
      ["Justificada", d.justified ?? 0],
      ["Lesionado", d.injured ?? 0],
    ] as [string, number][];
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);
    doc.text(chips.map(([k, v]) => `${k}: ${v}`).join("     "), margin, y);
    y += 22;

    // Detalle
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text("FECHA", margin, y);
    doc.text("SESIÓN", margin + 80, y);
    doc.text("ESTADO", pageW - margin, y, { align: "right" });
    y += 12;
    doc.setDrawColor(235, 235, 235);
    doc.line(margin, y, pageW - margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const r of summary.attendance.detail) {
      ensure(18);
      doc.setTextColor(60, 60, 60);
      doc.text(esDate(r.date), margin, y);
      const title = doc.splitTextToSize(r.title || "Sesión", 260)[0] as string;
      doc.text(title, margin + 80, y);
      doc.setTextColor(r.status === "present" ? 40 : 130, r.status === "present" ? 40 : 130, r.status === "present" ? 40 : 130);
      doc.text(STATUS_LABEL[r.status] ?? r.status, pageW - margin, y, { align: "right" });
      y += 16;
    }
    y += 12;
  }

  // ── Convocatorias ──
  sectionTitle("Convocatorias a partidos");
  const cal = summary.callups.summary;

  if (cal.totalConConvocatoria === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(150, 150, 150);
    doc.text("No hay partidos con convocatoria hecha en este periodo.", margin, y);
    y += 20;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text(`${cal.porcentaje ?? 0}%`, margin, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `Convocado en ${cal.convocado} de ${cal.totalConConvocatoria} partidos  ·  No convocado: ${cal.noConvocado}`,
      margin + 76, y + 2,
    );
    y += 30;

    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text("FECHA", margin, y);
    doc.text("RIVAL", margin + 80, y);
    doc.text("CONVOCADO", pageW - margin, y, { align: "right" });
    y += 12;
    doc.setDrawColor(235, 235, 235);
    doc.line(margin, y, pageW - margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const m of summary.callups.detail) {
      ensure(18);
      doc.setTextColor(60, 60, 60);
      doc.text(esDate(m.date), margin, y);
      const rival = `${m.opponent || "Rival"}${m.homeAway === "home" ? " (L)" : " (V)"}`;
      doc.text(doc.splitTextToSize(rival, 260)[0] as string, margin + 80, y);
      doc.setTextColor(m.called ? 40 : 150, m.called ? 40 : 150, m.called ? 40 : 150);
      doc.text(m.called ? "Sí" : "No", pageW - margin, y, { align: "right" });
      y += 16;
    }
    y += 12;
  }

  // ── Lesiones ──
  if (summary.injuries.length > 0) {
    sectionTitle("Historial de lesiones");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const inj of summary.injuries) {
      const head = [inj.zone, inj.description].filter(Boolean).join(" — ") || "Lesión";
      const period = `${esDate(inj.dateStart ?? "")}${inj.dateEnd ? ` - ${esDate(inj.dateEnd)}` : " - en curso"}`;
      const lines = doc.splitTextToSize(head, pageW - margin * 2 - 120) as string[];
      ensure(lines.length * 14 + 8);
      doc.setTextColor(40, 40, 40);
      doc.text(lines, margin, y);
      doc.setTextColor(140, 140, 140);
      doc.text(`${period}${inj.resolved ? "  (resuelta)" : ""}`, pageW - margin, y, { align: "right" });
      y += lines.length * 14 + 4;
    }
    y += 12;
  }

  // ── Incidencias ──
  if (summary.incidents.length > 0) {
    sectionTitle("Incidencias");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const inc of summary.incidents) {
      const text = [inc.type, inc.description].filter(Boolean).join(" — ") || "Incidencia";
      const lines = doc.splitTextToSize(text, pageW - margin * 2 - 90) as string[];
      ensure(lines.length * 14 + 8);
      doc.setTextColor(40, 40, 40);
      doc.text(lines, margin, y);
      if (inc.date) {
        doc.setTextColor(140, 140, 140);
        doc.text(esDate(inc.date), pageW - margin, y, { align: "right" });
      }
      y += lines.length * 14 + 4;
    }
  }

  footer();

  const safeName = summary.player.name.trim().replace(/\s+/g, "_") || "jugador";
  return { doc, fileName: `ficha_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf` };
}

export function generatePlayerPdf(summary: PlayerSummary, range?: PdfRange, accentHex = "#0891b2") {
  const { doc, fileName } = buildPlayerPdf(summary, range, accentHex);
  doc.save(fileName);
}
