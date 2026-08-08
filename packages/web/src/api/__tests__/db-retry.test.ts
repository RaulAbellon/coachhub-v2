import { describe, expect, it, vi } from "vitest";
import {
  backoffDelay,
  isRetryableDbError,
  withDbRetry,
  withRetryingClient,
} from "../database/retry";

const noWait = () => Promise.resolve();

describe("isRetryableDbError", () => {
  it("detecta ECONNRESET por código", () => {
    const err = Object.assign(new Error("boom"), { code: "ECONNRESET" });
    expect(isRetryableDbError(err)).toBe(true);
  });

  it("detecta el corte de socket de Turso por mensaje", () => {
    expect(
      isRetryableDbError(new Error("The socket connection was closed unexpectedly")),
    ).toBe(true);
  });

  it("detecta el error transitorio dentro de un DrizzleQueryError (cause)", () => {
    const inner = Object.assign(new Error("The socket connection was closed unexpectedly"), {
      code: "ECONNRESET",
    });
    const wrapper = Object.assign(
      new Error('Failed query: select "id" from "users" where "users"."username" = ?'),
      { cause: inner },
    );
    expect(isRetryableDbError(wrapper)).toBe(true);
  });

  it("detecta respuestas 5xx y 429 del servidor", () => {
    expect(isRetryableDbError(Object.assign(new Error("nope"), { status: 503 }))).toBe(true);
    expect(isRetryableDbError(Object.assign(new Error("nope"), { status: 429 }))).toBe(true);
    expect(isRetryableDbError(Object.assign(new Error("nope"), { status: 404 }))).toBe(false);
  });

  it("NO reintenta errores de SQL", () => {
    expect(isRetryableDbError(new Error("UNIQUE constraint failed: users.username"))).toBe(false);
    expect(isRetryableDbError(new Error("no such column: foo"))).toBe(false);
    expect(isRetryableDbError(new Error("SQLite error: syntax error near WHERE"))).toBe(false);
  });

  it("NO reintenta errores de autenticación del token de Turso", () => {
    expect(isRetryableDbError(new Error("Unauthorized: invalid token"))).toBe(false);
  });

  it("es seguro con valores raros", () => {
    expect(isRetryableDbError(null)).toBe(false);
    expect(isRetryableDbError(undefined)).toBe(false);
    expect(isRetryableDbError("ECONNRESET")).toBe(true);
    const circular: { cause?: unknown; message: string } = { message: "loop" };
    circular.cause = circular;
    expect(isRetryableDbError(circular)).toBe(false);
  });
});

describe("backoffDelay", () => {
  it("crece exponencialmente y añade jitter acotado", () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const base = 100;
      const min = base * 2 ** attempt;
      const delay = backoffDelay(attempt, base);
      expect(delay).toBeGreaterThanOrEqual(min);
      expect(delay).toBeLessThanOrEqual(min + base);
    }
  });
});

describe("withDbRetry", () => {
  it("devuelve el resultado sin reintentar cuando todo va bien", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withDbRetry("execute", fn, { wait: noWait })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta y acaba funcionando tras un ECONNRESET", async () => {
    const err = Object.assign(new Error("The socket connection was closed unexpectedly"), {
      code: "ECONNRESET",
    });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");
    const onRetry = vi.fn();
    await expect(withDbRetry("execute", fn, { wait: noWait, onRetry })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("agota los intentos y propaga el último error", async () => {
    const err = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withDbRetry("execute", fn, { wait: noWait, attempts: 3, onRetry: () => {} }),
    ).rejects.toThrow("ECONNRESET");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("no reintenta errores de SQL", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("UNIQUE constraint failed: users.username"));
    await expect(withDbRetry("execute", fn, { wait: noWait })).rejects.toThrow("UNIQUE constraint");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("espera entre intentos con backoff creciente", async () => {
    const err = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue("ok");
    await withDbRetry("execute", fn, {
      wait: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
      baseDelayMs: 10,
      onRetry: () => {},
    });
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });
});

describe("withRetryingClient", () => {
  it("reintenta execute() cuando Turso corta la conexión", async () => {
    const err = Object.assign(new Error("The socket connection was closed unexpectedly"), {
      code: "ECONNRESET",
    });
    const execute = vi.fn().mockRejectedValueOnce(err).mockResolvedValue({ rows: [] });
    const fake = { execute, transaction: vi.fn().mockResolvedValue("tx"), closed: false };
    const client = withRetryingClient(fake, { wait: noWait, onRetry: () => {} });
    await expect(client.execute("select 1")).resolves.toEqual({ rows: [] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("no envuelve transaction() ni las propiedades normales", async () => {
    const transaction = vi.fn().mockRejectedValue(
      Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }),
    );
    const fake = { execute: vi.fn(), transaction, closed: true };
    const client = withRetryingClient(fake, { wait: noWait, onRetry: () => {} });
    expect(client.closed).toBe(true);
    await expect(client.transaction()).rejects.toThrow("ECONNRESET");
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
