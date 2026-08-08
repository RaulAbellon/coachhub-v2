import { describe, expect, it } from "vitest";
import { mondayOf, microcycleByMonday } from "../routes/sessions";

/** Atajo: número de MC que le toca a cada fecha del listado. */
function numbers(dates: string[]): number[] {
  const map = microcycleByMonday(dates);
  return dates.map((d) => map.get(mondayOf(d))!);
}

describe("mondayOf", () => {
  it("resuelve el lunes de la semana ISO", () => {
    expect(mondayOf("2026-08-03")).toBe("2026-08-03"); // lunes
    expect(mondayOf("2026-08-09")).toBe("2026-08-03"); // domingo
    expect(mondayOf("2026-08-01")).toBe("2026-07-27"); // cruza de mes
  });
});

describe("microcycleByMonday", () => {
  it("MC 1 es la semana de la primera sesión", () => {
    expect(numbers(["2026-08-05"])).toEqual([1]);
  });

  it("todas las sesiones de la misma semana comparten microciclo", () => {
    expect(numbers(["2026-08-04", "2026-08-06", "2026-08-08"])).toEqual([1, 1, 1]);
  });

  it("NO se reinicia al cambiar de mes: la cuenta sigue subiendo", () => {
    const dates = ["2026-08-25", "2026-09-01", "2026-09-08", "2026-10-06"];
    expect(numbers(dates)).toEqual([1, 2, 3, 4]);
  });

  it("NO se reinicia al cambiar de año", () => {
    expect(numbers(["2026-12-28", "2027-01-04", "2027-01-11"])).toEqual([1, 2, 3]);
  });

  it("una semana sin sesiones no consume número", () => {
    // Se entrena la semana del 3/8, se descansa la del 10/8 y se vuelve el 17/8.
    expect(numbers(["2026-08-05", "2026-08-19"])).toEqual([1, 2]);
  });

  it("un parón largo tampoco salta números", () => {
    expect(numbers(["2026-06-10", "2026-09-09"])).toEqual([1, 2]);
  });

  it("renumera cuando aparece una sesión anterior a la primera", () => {
    const antes = numbers(["2026-08-05", "2026-08-12"]);
    expect(antes).toEqual([1, 2]);
    // Se añade una sesión de la semana previa: esa pasa a MC 1 y el resto sube.
    const map = microcycleByMonday(["2026-07-29", "2026-08-05", "2026-08-12"]);
    expect(map.get(mondayOf("2026-07-29"))).toBe(1);
    expect(map.get(mondayOf("2026-08-05"))).toBe(2);
    expect(map.get(mondayOf("2026-08-12"))).toBe(3);
  });

  it("no depende del orden en el que lleguen las fechas", () => {
    const desordenado = microcycleByMonday(["2026-09-08", "2026-08-05", "2026-08-25"]);
    expect(desordenado.get(mondayOf("2026-08-05"))).toBe(1);
    expect(desordenado.get(mondayOf("2026-08-25"))).toBe(2);
    expect(desordenado.get(mondayOf("2026-09-08"))).toBe(3);
  });

  it("es una numeración densa y sin huecos", () => {
    const dates = ["2026-08-05", "2026-08-19", "2026-09-02", "2026-11-11"];
    expect(numbers(dates)).toEqual([1, 2, 3, 4]);
  });

  it("devuelve un mapa vacío sin sesiones", () => {
    expect(microcycleByMonday([]).size).toBe(0);
  });
});
