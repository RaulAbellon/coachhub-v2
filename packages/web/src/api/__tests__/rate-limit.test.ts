import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkImportRateLimit,
  checkAuthRateLimit,
  recordAuthFailure,
  clearAuthFailures,
  __resetRateLimits,
} from "../lib/rate-limit";

describe("checkImportRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(checkImportRateLimit(key).allowed).toBe(true);
    }
  });

  it("blocks the 11th request within the same window", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 10; i++) checkImportRateLimit(key);
    const result = checkImportRateLimit(key);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests again once the window has elapsed", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 10; i++) checkImportRateLimit(key);
    expect(checkImportRateLimit(key).allowed).toBe(false);

    vi.setSystemTime(60_001);
    expect(checkImportRateLimit(key).allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;
    for (let i = 0; i < 10; i++) checkImportRateLimit(keyA);
    expect(checkImportRateLimit(keyA).allowed).toBe(false);
    expect(checkImportRateLimit(keyB).allowed).toBe(true);
  });
});

describe("auth rate limit (S-01)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    __resetRateLimits();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no consume cuota al comprobar: mil comprobaciones siguen permitidas", () => {
    const ip = "1.1.1.1";
    for (let i = 0; i < 1000; i++) expect(checkAuthRateLimit(ip).allowed).toBe(true);
  });

  it("bloquea tras 10 intentos fallidos y devuelve retryAfterMs", () => {
    const ip = "2.2.2.2";
    for (let i = 0; i < 10; i++) {
      expect(checkAuthRateLimit(ip).allowed).toBe(true);
      recordAuthFailure(ip);
    }
    const result = checkAuthRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(15 * 60_000);
  });

  it("un login correcto limpia los fallos acumulados", () => {
    const ip = "3.3.3.3";
    for (let i = 0; i < 10; i++) recordAuthFailure(ip);
    expect(checkAuthRateLimit(ip).allowed).toBe(false);
    clearAuthFailures(ip);
    expect(checkAuthRateLimit(ip).allowed).toBe(true);
  });

  it("vuelve a permitir cuando pasa la ventana de 15 minutos", () => {
    const ip = "4.4.4.4";
    for (let i = 0; i < 10; i++) recordAuthFailure(ip);
    expect(checkAuthRateLimit(ip).allowed).toBe(false);
    vi.setSystemTime(15 * 60_000 + 1);
    expect(checkAuthRateLimit(ip).allowed).toBe(true);
  });

  it("cada IP tiene su propia cuota", () => {
    for (let i = 0; i < 10; i++) recordAuthFailure("5.5.5.5");
    expect(checkAuthRateLimit("5.5.5.5").allowed).toBe(false);
    expect(checkAuthRateLimit("6.6.6.6").allowed).toBe(true);
  });

  it("la cuota de auth es independiente de la de importación", () => {
    for (let i = 0; i < 10; i++) recordAuthFailure("7.7.7.7");
    expect(checkAuthRateLimit("7.7.7.7").allowed).toBe(false);
    expect(checkImportRateLimit("7.7.7.7").allowed).toBe(true);
  });
});
