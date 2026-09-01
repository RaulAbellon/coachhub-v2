import { describe, it, expect } from "vitest";
import { ATTENDANCE_COUNTED, countsForAttendance, attendancePct, attendancePct1 } from "../lib/attendance";

describe("countsForAttendance", () => {
  it("cuenta las presencias y las ausencias sin justificar", () => {
    expect(countsForAttendance("present")).toBe(true);
    expect(countsForAttendance("absent")).toBe(true);
  });
  it("deja fuera las justificadas y las lesiones", () => {
    expect(countsForAttendance("justified")).toBe(false);
    expect(countsForAttendance("injured")).toBe(false);
  });
  it("deja fuera cualquier estado desconocido", () => {
    expect(countsForAttendance("")).toBe(false);
    expect(countsForAttendance("late")).toBe(false);
  });
  it("expone la lista de estados computables", () => {
    expect([...ATTENDANCE_COUNTED]).toEqual(["present", "absent"]);
  });
});

describe("attendancePct", () => {
  it("calcula el porcentaje entero", () => {
    expect(attendancePct(2, 3)).toBe(67);
    expect(attendancePct(1, 2)).toBe(50);
    expect(attendancePct(5, 5)).toBe(100);
    expect(attendancePct(0, 4)).toBe(0);
  });
  it("devuelve null si no hay sesiones computables", () => {
    expect(attendancePct(0, 0)).toBeNull();
  });
  it("las justificadas y lesiones no bajan el porcentaje", () => {
    // 2 presentes, 1 ausente, 1 justificada, 1 lesionada -> 2/3, no 2/5
    const rows = ["present", "present", "absent", "justified", "injured"];
    const computables = rows.filter(countsForAttendance).length;
    const presentes = rows.filter((r) => r === "present").length;
    expect(computables).toBe(3);
    expect(attendancePct(presentes, computables)).toBe(67);
  });
  it("solo justificadas -> null (guion en pantalla)", () => {
    const rows = ["justified", "justified", "injured"];
    const computables = rows.filter(countsForAttendance).length;
    expect(computables).toBe(0);
    expect(attendancePct(0, computables)).toBeNull();
  });
});

describe("attendancePct1", () => {
  it("calcula el porcentaje con un decimal", () => {
    expect(attendancePct1(2, 3)).toBe(66.7);
    expect(attendancePct1(1, 8)).toBe(12.5);
    expect(attendancePct1(3, 3)).toBe(100);
  });
  it("devuelve null si no hay sesiones computables", () => {
    expect(attendancePct1(0, 0)).toBeNull();
  });
});
