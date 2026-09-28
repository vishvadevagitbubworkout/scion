import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  setupTestEnvironment,
} from "./testHelper.js";
import User from "../src/models/User.js";
import { hashPassword } from "../src/utils/password.js";

describe("Security Attack Vectors (Section 44)", () => {
  let apiRequest;
  let teardown;
  let viewerUser;
  let viewerCookie;

  before(async () => {
    const env = await setupTestEnvironment();
    apiRequest = env.apiRequest;
    teardown = env.teardown;

    const hashedPassword = await hashPassword("SafePassword123!");

    viewerUser = await User.create({
      name: "Security Test User",
      email: "secuser@example.com",
      passwordHash: hashedPassword,
      role: "VIEWER",
      isActive: true,
    });

    const loginRes = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "secuser@example.com", password: "SafePassword123!" },
    });
    viewerCookie = loginRes.setCookie;
  });

  after(async () => {
    if (teardown) await teardown();
  });

  it("Attack 1 — Role injection: Backend ignores requested role and assigns VIEWER", async () => {
    const res = await apiRequest("/api/auth/register", {
      method: "POST",
      body: {
        name: "Attacker 1",
        email: "attacker1@example.com",
        password: "StrongPassword123!",
        role: "ROOT",
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.user.role, "VIEWER");

    const inDb = await User.findOne({ email: "attacker1@example.com" });
    assert.equal(inDb.role, "VIEWER");
  });

  it("Attack 2 — Fake user ID: Identity is determined by token, not request query params", async () => {
    // Attempt to spoof another user ID in query param when accessing /api/auth/me
    const res = await apiRequest("/api/auth/me?userId=660000000000000000000999&role=ROOT", {
      method: "GET",
      cookie: viewerCookie,
    });

    assert.equal(res.status, 200);
    // Identity must still be the true viewerUser
    assert.equal(res.data.user.id, viewerUser._id.toString());
    assert.equal(res.data.user.role, "VIEWER");
  });

  it("Attack 3 — Missing JWT: Protected route without cookie or auth returns 401", async () => {
    const res = await apiRequest("/api/test/viewer");
    assert.equal(res.status, 401);
  });

  it("Attack 4 — Invalid JWT: Malformed token string returns 401", async () => {
    const res = await apiRequest("/api/test/viewer", {
      cookie: "scion_access_token=not.a.valid.jwt.string",
    });
    assert.equal(res.status, 401);
  });

  it("Attack 5 — Tampered JWT: Modifying token payload/signature returns 401", async () => {
    // Extract actual token from cookie
    const match = viewerCookie.match(/scion_access_token=([^;]+)/);
    assert.ok(match);
    const validToken = match[1];

    // Tamper with the signature portion
    const tampered = validToken.slice(0, -6) + "xxxxxx";
    const res = await apiRequest("/api/test/viewer", {
      cookie: `scion_access_token=${tampered}`,
    });

    assert.equal(res.status, 401);
  });

  it("Attack 6 — Expired JWT: Token past expiration date returns 401", async () => {
    const expiredToken = jwt.sign(
      { sub: viewerUser._id.toString(), role: "VIEWER" },
      process.env.JWT_SECRET,
      { expiresIn: "-10s" }
    );

    const res = await apiRequest("/api/test/viewer", {
      cookie: `scion_access_token=${expiredToken}`,
    });

    assert.equal(res.status, 401);
    assert.equal(res.data.message, "Token has expired");
  });

  it("Attack 7 — Wrong role: Authenticated VIEWER accessing ROOT endpoint returns 403", async () => {
    const res = await apiRequest("/api/test/root", {
      cookie: viewerCookie,
    });

    assert.equal(res.status, 403);
  });

  it("Attack 8 — Inactive account: Deactivated user with valid token is denied with 401", async () => {
    // 1. Deactivate the user in database
    await User.findByIdAndUpdate(viewerUser._id, { isActive: false });

    // 2. Attempt protected request using previously valid token
    const res = await apiRequest("/api/test/viewer", {
      cookie: viewerCookie,
    });

    assert.equal(res.status, 401);
    assert.equal(res.data.message, "Account has been deactivated");

    // 3. Attempt login with deactivated user
    const loginRes = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "secuser@example.com", password: "SafePassword123!" },
    });

    assert.equal(loginRes.status, 401);
    assert.equal(loginRes.data.message, "Account has been deactivated");
  });
});
