import { describe, it, expect } from "vitest";
import { legacySha256Hash, hashPassword, isLegacyHash, verifyPassword } from "../routes/auth";

describe("password hashing (F-0001)", () => {
  it("hashPassword produces a bcrypt hash, not the legacy sha256 format", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$2")).toBe(true);
    expect(isLegacyHash(hash)).toBe(false);
  });

  it("isLegacyHash detects legacy sha256+salt hashes", () => {
    const legacy = legacySha256Hash("mypassword");
    expect(isLegacyHash(legacy)).toBe(true);
  });

  it("verifyPassword accepts a correct bcrypt password", async () => {
    const hash = await hashPassword("s3cret!");
    await expect(verifyPassword("s3cret!", hash)).resolves.toBe(true);
  });

  it("verifyPassword rejects an incorrect bcrypt password", async () => {
    const hash = await hashPassword("s3cret!");
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("verifyPassword still validates legacy sha256 hashes (transparent migration path)", async () => {
    const legacy = legacySha256Hash("oldpassword");
    await expect(verifyPassword("oldpassword", legacy)).resolves.toBe(true);
    await expect(verifyPassword("wrongpassword", legacy)).resolves.toBe(false);
  });
});
