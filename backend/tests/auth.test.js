import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  setupTestEnvironment,
} from "./testHelper.js";
import User from "../src/models/User.js";

describe("Authentication Lifecycle & Endpoints", () => {
  let apiRequest;
  let teardown;

  before(async () => {
    const env = await setupTestEnvironment();
    apiRequest = env.apiRequest;
    teardown = env.teardown;
  });

  after(async () => {
    if (teardown) await teardown();
  });

  it("should register a new VIEWER account with 201 status", async () => {
    const res = await apiRequest("/api/auth/register", {
      method: "POST",
      body: {
        name: "Alice Viewer",
        email: "alice@example.com",
        password: "Password123!",
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.user.name, "Alice Viewer");
    assert.equal(res.data.user.email, "alice@example.com");
    assert.equal(res.data.user.role, "VIEWER");
    assert.equal(res.data.user.password, undefined);
    assert.equal(res.data.user.passwordHash, undefined);

    // Verify stored user in DB
    const dbUser = await User.findOne({ email: "alice@example.com" }).select(
      "+passwordHash"
    );
    assert.ok(dbUser);
    assert.equal(dbUser.role, "VIEWER");
    assert.ok(dbUser.passwordHash.startsWith("$argon2"));
    assert.notEqual(dbUser.passwordHash, "Password123!");
  });

  it("should reject duplicate email with 409 Conflict", async () => {
    const res = await apiRequest("/api/auth/register", {
      method: "POST",
      body: {
        name: "Alice Duplicate",
        email: "ALICE@example.com", // testing normalization
        password: "Password123!",
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.data.message, "Email already exists");
  });

  it("should prevent role injection and force role to VIEWER", async () => {
    const res = await apiRequest("/api/auth/register", {
      method: "POST",
      body: {
        name: "Attacker",
        email: "attacker@example.com",
        password: "StrongPassword123!",
        role: "ROOT",
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.user.role, "VIEWER");

    const dbUser = await User.findOne({ email: "attacker@example.com" });
    assert.equal(dbUser.role, "VIEWER");
  });

  it("should reject registration with invalid input with 400 Bad Request", async () => {
    const res = await apiRequest("/api/auth/register", {
      method: "POST",
      body: {
        name: "",
        email: "not-an-email",
        password: "short",
      },
    });

    assert.equal(res.status, 400);
    assert.ok(res.data.errors.length > 0);
  });

  it("should login with valid credentials and return HttpOnly cookie", async () => {
    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email: "alice@example.com",
        password: "Password123!",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.user.email, "alice@example.com");
    assert.equal(res.data.user.role, "VIEWER");
    assert.equal(res.data.user.password, undefined);
    assert.equal(res.data.user.passwordHash, undefined);

    // Verify set-cookie header contains scion_access_token and HttpOnly
    assert.ok(res.setCookie);
    assert.ok(res.setCookie.includes("scion_access_token="));
    assert.ok(res.setCookie.toLowerCase().includes("httponly"));
  });

  it("should reject login with wrong password with 401 Unauthorized", async () => {
    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email: "alice@example.com",
        password: "WrongPassword999!",
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.data.message, "Invalid email or password");
  });

  it("should reject login with non-existent email with 401 Unauthorized", async () => {
    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email: "ghost@example.com",
        password: "Password123!",
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.data.message, "Invalid email or password");
  });

  it("should allow /api/auth/me when authenticated with cookie", async () => {
    // 1. Login to get cookie
    const loginRes = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email: "alice@example.com",
        password: "Password123!",
      },
    });

    const cookie = loginRes.setCookie;

    // 2. Access /api/auth/me with cookie
    const meRes = await apiRequest("/api/auth/me", {
      method: "GET",
      cookie,
    });

    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.email, "alice@example.com");
    assert.equal(meRes.data.user.role, "VIEWER");
    assert.equal(meRes.data.user.passwordHash, undefined);
  });

  it("should reject /api/auth/me without authentication cookie with 401", async () => {
    const meRes = await apiRequest("/api/auth/me", {
      method: "GET",
    });

    assert.equal(meRes.status, 401);
  });

  it("should handle logout and invalidate session on /api/auth/me", async () => {
    // 1. Login
    const loginRes = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email: "alice@example.com",
        password: "Password123!",
      },
    });

    const cookie = loginRes.setCookie;

    // 2. Logout
    const logoutRes = await apiRequest("/api/auth/logout", {
      method: "POST",
      cookie,
    });

    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.data.message, "Logged out successfully");

    // Verify cookie expired/cleared
    const clearCookie = logoutRes.setCookie;
    assert.ok(
      clearCookie.includes("Max-Age=0") ||
        clearCookie.includes("Expires=Thu, 01 Jan 1970") ||
        clearCookie.includes("scion_access_token=;")
    );

    // 3. Trying /me without cookie or with cleared cookie yields 401
    const meRes = await apiRequest("/api/auth/me", {
      method: "GET",
      cookie: clearCookie,
    });

    assert.equal(meRes.status, 401);
  });
});
