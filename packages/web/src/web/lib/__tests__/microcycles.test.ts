import { describe, it, expect } from "vitest";
import {
  getMonday,
  getWeekDates,
  monthMicrocycles,
  findMicrocycleIndex,
  weekLabel,
  weekRangeLabel,
} from "../microcycles";

describe("getMonday", () => {
  it("devuelve el mismo día si ya es lunes", () => {
    expect(getMonday("2026-08-03")).toBe("2026-08-03");
  });
  it("retrocede al lunes anterior desde un domingo", () => {
    expect(getMonday("2026-08-09")).toBe("2026-08-03");
  });
  it("cruza el cambio de mes", () => {
    expect(getMonday("2026-08-01")).toBe("2026-07-27");
  });
});

describe("getWeekDates", () => {
  it("devuelve 7 días consecutivos de lunes a domingo", () => {
    expect(getWeekDates("2026-08-03")).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
      "2026-08-07", "2026-08-08", "2026-08-09",
    ]);
  });
});

describe("monthMicrocycles", () => {
  it("no numera nada cuando el mes no tiene sesiones", () => {
    const weeks = monthMicrocycles(2026, 7); // agosto 2026
    expect(weeks.map((w) => w.label)).toEqual([null, null, null, null, null, null]);
    expect(weeks.every((w) => w.mcNumbers.length === 0)).toBe(true);
    expect(weeks[0]!.monday).toBe("2026-07-27");
    expect(weeks[weeks.length - 1]!.monday).toBe("2026-08-31");
  });

  it("usa el número real de microciclo de las sesiones y NO extrapola las semanas vacías", () => {
    const weeks = monthMicrocycles(2026, 7, [
      { date: "2026-08-05", microcycle: 12 },
      { date: "2026-08-06", microcycle: 12 },
    ]);
    // La semana del 3 al 9 de agosto es el índice 1 de la lista.
    expect(weeks[1]!.label).toBe("MC 12");
    expect(weeks[1]!.mcNumbers).toEqual([12]);
    expect(weeks[0]!.label).toBeNull();
    expect(weeks[2]!.label).toBeNull();
  });

  it("no reinicia la numeración al cambiar de mes", () => {
    // Misma temporada: MC 21 en septiembre viene después del MC 20 de agosto.
    const ago = monthMicrocycles(2026, 7, [{ date: "2026-08-31", microcycle: 20 }]);
    const sep = monthMicrocycles(2026, 8, [
      { date: "2026-08-31", microcycle: 20 },
      { date: "2026-09-08", microcycle: 21 },
    ]);
    expect(ago[ago.length - 1]!.label).toBe("MC 20");
    // La semana del 31/08 aparece en los dos meses y mantiene su número.
    expect(sep[0]!.monday).toBe("2026-08-31");
    expect(sep[0]!.label).toBe("MC 20");
    expect(sep[1]!.label).toBe("MC 21");
  });

  it("muestra todos los números cuando cada equipo va por su cuenta", () => {
    const weeks = monthMicrocycles(2026, 7, [
      { date: "2026-08-04", microcycle: 3 },
      { date: "2026-08-05", microcycle: 7 },
      { date: "2026-08-06", microcycle: 7 },
    ]);
    expect(weeks[1]!.mcNumbers).toEqual([3, 7]);
    expect(weeks[1]!.label).toBe("MC 3 · 7");
  });

  it("ignora microciclos nulos", () => {
    const weeks = monthMicrocycles(2026, 7, [{ date: "2026-08-04", microcycle: null }]);
    expect(weeks.map((w) => w.label)).toEqual([null, null, null, null, null, null]);
  });

  it("ignora sesiones de fuera del mes visible", () => {
    const weeks = monthMicrocycles(2026, 7, [{ date: "2026-12-01", microcycle: 40 }]);
    expect(weeks.every((w) => w.label === null)).toBe(true);
  });
});

describe("weekRangeLabel / weekLabel", () => {
  it("formatea el rango dentro del mismo mes", () => {
    expect(weekRangeLabel("2026-08-03")).toBe("3–9 ago");
  });
  it("formatea el rango a caballo entre dos meses", () => {
    expect(weekRangeLabel("2026-07-27")).toBe("27 jul–2 ago");
  });
  it("usa el MC si existe y el rango si no", () => {
    const [vacia, conMc] = monthMicrocycles(2026, 7, [{ date: "2026-08-05", microcycle: 4 }]);
    expect(weekLabel(conMc!)).toBe("MC 4");
    expect(weekLabel(vacia!)).toBe("27 jul–2 ago");
  });
});

describe("findMicrocycleIndex", () => {
  it("localiza la semana que contiene una fecha", () => {
    const weeks = monthMicrocycles(2026, 7);
    expect(findMicrocycleIndex(weeks, "2026-08-08")).toBe(1);
    expect(findMicrocycleIndex(weeks, "2026-12-01")).toBe(-1);
  });
});
