import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/utils/password.js";

describe("Password Utility (Argon2)", () => {
  it("should hash a password using Argon2", async () => {
    const password = "StrongPassword123!";
    const hash = await hashPassword(password);

    assert.ok(hash);
    assert.ok(hash.startsWith("$argon2"));
    assert.notEqual(hash, password);
  });

  it("should verify correct password against hash", async () => {
    const password = "StrongPassword123!";
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword(password, hash);
    assert.equal(isMatch, true);
  });

  it("should reject incorrect password against hash", async () => {
    const password = "StrongPassword123!";
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword("WrongPassword123!", hash);
    assert.equal(isMatch, false);
  });

  it("should throw error if hashing empty or non-string password", async () => {
    await assert.rejects(async () => {
      await hashPassword("");
    });
    await assert.rejects(async () => {
      await hashPassword(null);
    });
  });

  it("should return false when verifying invalid or missing parameters", async () => {
    assert.equal(await verifyPassword("", "somehash"), false);
    assert.equal(await verifyPassword("password", ""), false);
    assert.equal(await verifyPassword("password", "invalid_argon_hash"), false);
  });
});
