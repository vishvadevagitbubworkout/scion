import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { generateAccessToken, verifyAccessToken } from "../src/utils/jwt.js";

describe("JWT Utility", () => {
  before(() => {
    process.env.JWT_SECRET = "test_jwt_secret_key_123456";
    process.env.JWT_EXPIRES_IN = "1h";
  });

  it("should generate a valid JWT with sub and role claims", () => {
    const user = { _id: "660000000000000000000001", role: "VIEWER" };
    const token = generateAccessToken(user);

    assert.ok(typeof token === "string");
    const decoded = verifyAccessToken(token);

    assert.equal(decoded.sub, "660000000000000000000001");
    assert.equal(decoded.role, "VIEWER");
    assert.ok(decoded.exp);
    assert.ok(decoded.iat);
  });

  it("should reject a tampered token", () => {
    const user = { _id: "660000000000000000000001", role: "VIEWER" };
    const token = generateAccessToken(user);
    const tamperedToken = token.slice(0, -5) + "abcde";

    assert.throws(() => {
      verifyAccessToken(tamperedToken);
    });
  });

  it("should reject an expired token", async () => {
    const expiredToken = jwt.sign(
      { sub: "660000000000000000000001", role: "VIEWER" },
      process.env.JWT_SECRET,
      { expiresIn: "-1s" }
    );

    assert.throws(
      () => {
        verifyAccessToken(expiredToken);
      },
      (err) => err.name === "TokenExpiredError"
    );
  });

  it("should reject token signed with a different secret", () => {
    const fakeToken = jwt.sign(
      { sub: "660000000000000000000001", role: "ROOT" },
      "wrong_secret"
    );

    assert.throws(() => {
      verifyAccessToken(fakeToken);
    });
  });
});
