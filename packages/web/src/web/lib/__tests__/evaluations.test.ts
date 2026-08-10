import { describe, it, expect } from "vitest";
import {
  parseValue,
  computeTrend,
  computeStats,
  rankPlayers,
  buildEvaluationsCsv,
  categoryOf,
  type EvalTest,
} from "../evaluations";

describe("parseValue", () => {
  it("acepta coma decimal", () => {
    expect(parseValue("4,52")).toBe(4.52);
  });
  it("acepta punto decimal y espacios", () => {
    expect(parseValue(" 4.52 ")).toBe(4.52);
  });
  it("devuelve null con vacío, null o texto no numérico", () => {
    expect(parseValue("")).toBeNull();
    expect(parseValue(null)).toBeNull();
    expect(parseValue(undefined)).toBeNull();
    expect(parseValue("abc")).toBeNull();
  });
});

describe("computeTrend", () => {
  it("tiempo mejorado (menor es mejor)", () => {
    const t = computeTrend("4.40", "4.52", true)!;
    expect(t.improved).toBe(true);
    expect(t.arrow).toBe("↓");
    expect(t.label).toBe("-0.12");
  });
  it("tiempo empeorado (menor es mejor)", () => {
    const t = computeTrend("4.70", "4.52", true)!;
    expect(t.improved).toBe(false);
    expect(t.arrow).toBe("↑");
    expect(t.label).toBe("+0.18");
  });
  it("salto mejorado (mayor es mejor)", () => {
    const t = computeTrend("42", "38", false)!;
    expect(t.improved).toBe(true);
    expect(t.arrow).toBe("↑");
    expect(t.label).toBe("+4");
  });
  it("sin cambio", () => {
    const t = computeTrend("38", "38", false)!;
    expect(t.flat).toBe(true);
    expect(t.improved).toBe(false);
    expect(t.arrow).toBe("—");
    expect(t.label).toBe("0");
  });
  it("null si falta algún valor", () => {
    expect(computeTrend("38", null, false)).toBeNull();
    expect(computeTrend(null, "38", false)).toBeNull();
  });
});

describe("computeStats", () => {
  it("best/worst con menor es mejor", () => {
    const s = computeStats(["4,52", "4.40", "", null, "4.60"], true)!;
    expect(s.count).toBe(3);
    expect(s.min).toBe(4.4);
    expect(s.max).toBe(4.6);
    expect(s.best).toBe(4.4);
    expect(s.worst).toBe(4.6);
    expect(s.avg).toBe(4.51);
  });
  it("best/worst con mayor es mejor", () => {
    const s = computeStats(["30", "45", "38"], false)!;
    expect(s.best).toBe(45);
    expect(s.worst).toBe(30);
  });
  it("null si no hay valores numéricos", () => {
    expect(computeStats(["", null, "x"], false)).toBeNull();
  });
});

describe("rankPlayers", () => {
  const rows = [
    { playerId: 1, value: "4.60" },
    { playerId: 2, value: "4.40" },
    { playerId: 3, value: null },
    { playerId: 4, value: "4,50" },
  ];
  it("ordena mejor primero cuando menor es mejor y excluye sin valor", () => {
    const r = rankPlayers(rows, true);
    expect(r.map((x) => x.playerId)).toEqual([2, 4, 1]);
    expect(r.map((x) => x.position)).toEqual([1, 2, 3]);
  });
  it("ordena mejor primero cuando mayor es mejor", () => {
    const r = rankPlayers(rows, false);
    expect(r.map((x) => x.playerId)).toEqual([1, 4, 2]);
  });
});

describe("categoryOf", () => {
  it("cae en 'otro' con categoría desconocida o vacía", () => {
    expect(categoryOf("no-existe").label).toBe("Otro");
    expect(categoryOf(null).label).toBe("Otro");
    expect(categoryOf("fuerza").label).toBe("Fuerza");
  });
});

describe("buildEvaluationsCsv", () => {
  const tests: EvalTest[] = [
    { id: 10, teamId: 1, name: "Sprint 30m", unit: "s", description: "", category: "velocidad", lowerIsBetter: true, sortOrder: 0 },
    { id: 11, teamId: 1, name: 'Salto "CMJ"; test', unit: "cm", description: "", category: "fuerza", lowerIsBetter: false, sortOrder: 1 },
  ];
  const sessions = [
    { id: 2, teamId: 1, date: "2026-02-01", notes: "" },
    { id: 1, teamId: 1, date: "2026-01-01", notes: "" },
  ];
  const players = [
    { id: 100, name: "Ana", number: 7, isAdditional: false },
    { id: 101, name: "Lucía", number: null, isAdditional: true },
  ];
  const values = [
    { id: 1, sessionId: 1, playerId: 100, testId: 10, value: "4.52" },
    { id: 2, sessionId: 2, playerId: 100, testId: 10, value: "4.40" },
    { id: 3, sessionId: 2, playerId: 101, testId: 11, value: "38" },
  ];

  it("genera BOM, separador ';' y cabecera con unidades", () => {
    const csv = buildEvaluationsCsv({ players, tests, sessions, values });
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.replace("﻿", "").split("\n");
    expect(lines[0]).toBe('Fecha;Dorsal;Jugador;Adicional;Sprint 30m (s);"Salto ""CMJ""; test (cm)"');
  });

  it("ordena por fecha, omite filas vacías y marca los adicionales", () => {
    const csv = buildEvaluationsCsv({ players, tests, sessions, values });
    const lines = csv.replace("﻿", "").split("\n").slice(1);
    expect(lines).toEqual([
      "2026-01-01;7;Ana;;4.52;",
      "2026-02-01;7;Ana;;4.40;",
      "2026-02-01;;Lucía;Sí;;38",
    ]);
  });
});
