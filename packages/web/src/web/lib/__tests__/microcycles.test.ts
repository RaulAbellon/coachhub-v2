import { describe, it, expect } from "vitest";
import { getMonday, getWeekDates, monthMicrocycles, findMicrocycleIndex } from "../microcycles";

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
  it("numera 1..N cuando no hay sesiones", () => {
    const weeks = monthMicrocycles(2026, 7); // agosto 2026
    expect(weeks.map((w) => w.label)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(weeks[0]!.monday).toBe("2026-07-27");
    expect(weeks[weeks.length - 1]!.monday).toBe("2026-08-31");
  });

  it("usa el número real de microciclo de las sesiones y extrapola el resto", () => {
    const weeks = monthMicrocycles(2026, 7, [
      { date: "2026-08-05", microcycle: 12 },
      { date: "2026-08-06", microcycle: 12 },
    ]);
    // La semana del 3 al 9 de agosto es el índice 1 de la lista.
    expect(weeks[1]!.label).toBe(12);
    expect(weeks[0]!.label).toBe(11);
    expect(weeks[2]!.label).toBe(13);
  });

  it("elige el microciclo más frecuente cuando hay equipos con distinta numeración", () => {
    const weeks = monthMicrocycles(2026, 7, [
      { date: "2026-08-04", microcycle: 3 },
      { date: "2026-08-05", microcycle: 7 },
      { date: "2026-08-06", microcycle: 7 },
    ]);
    expect(weeks[1]!.label).toBe(7);
  });

  it("ignora microciclos nulos", () => {
    const weeks = monthMicrocycles(2026, 7, [{ date: "2026-08-04", microcycle: null }]);
    expect(weeks.map((w) => w.label)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("nunca etiqueta por debajo de 1", () => {
    const weeks = monthMicrocycles(2026, 7, [{ date: "2026-08-25", microcycle: 1 }]);
    expect(weeks.every((w) => w.label >= 1)).toBe(true);
  });
});

describe("findMicrocycleIndex", () => {
  it("localiza la semana que contiene una fecha", () => {
    const weeks = monthMicrocycles(2026, 7);
    expect(findMicrocycleIndex(weeks, "2026-08-08")).toBe(1);
    expect(findMicrocycleIndex(weeks, "2026-12-01")).toBe(-1);
  });
});
