import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkImportRateLimit } from "../lib/rate-limit";

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
