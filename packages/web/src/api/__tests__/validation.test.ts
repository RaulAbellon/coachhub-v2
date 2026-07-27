import { describe, it, expect } from "vitest";
import { assertBase64FieldsWithinLimit, PayloadTooLargeError, safeJson, MAX_BASE64_FIELD_BYTES } from "../lib/validation";

describe("assertBase64FieldsWithinLimit", () => {
  it("does not throw when fields are within the limit", () => {
    expect(() =>
      assertBase64FieldsWithinLimit({ photoData: "a".repeat(100) }, ["photoData"]),
    ).not.toThrow();
  });

  it("does not throw when the field is missing or not a string", () => {
    expect(() => assertBase64FieldsWithinLimit({}, ["photoData"])).not.toThrow();
    expect(() => assertBase64FieldsWithinLimit({ photoData: null }, ["photoData"])).not.toThrow();
  });

  it("throws PayloadTooLargeError when a field exceeds the limit", () => {
    const oversized = "a".repeat(MAX_BASE64_FIELD_BYTES + 1);
    expect(() => assertBase64FieldsWithinLimit({ pdfData: oversized }, ["pdfData"])).toThrow(
      PayloadTooLargeError,
    );
  });

  it("identifies the offending field on the thrown error", () => {
    const oversized = "a".repeat(MAX_BASE64_FIELD_BYTES + 1);
    try {
      assertBase64FieldsWithinLimit({ photoData: oversized }, ["photoData"]);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PayloadTooLargeError);
      expect((err as InstanceType<typeof PayloadTooLargeError>).field).toBe("photoData");
    }
  });

  it("checks every field passed, not just the first", () => {
    const oversized = "a".repeat(MAX_BASE64_FIELD_BYTES + 1);
    expect(() =>
      assertBase64FieldsWithinLimit({ a: "short", b: oversized }, ["a", "b"]),
    ).toThrow(PayloadTooLargeError);
  });
});

describe("safeJson", () => {
  it("returns the parsed body when JSON is valid", async () => {
    const fakeCtx = { req: { json: async () => ({ ok: true }) } };
    await expect(safeJson(fakeCtx)).resolves.toEqual({ ok: true });
  });

  it("returns null instead of throwing when JSON is invalid", async () => {
    const fakeCtx = { req: { json: async () => { throw new SyntaxError("bad json"); } } };
    await expect(safeJson(fakeCtx)).resolves.toBeNull();
  });
});
