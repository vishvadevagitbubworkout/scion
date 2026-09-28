import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  setupTestEnvironment,
} from "./testHelper.js";
import User from "../src/models/User.js";
import { hashPassword } from "../src/utils/password.js";

describe("Role-Based Access Control (RBAC) Matrix", () => {
  let apiRequest;
  let teardown;
  let viewerCookie;
  let authorCookie;
  let rootCookie;

  before(async () => {
    const env = await setupTestEnvironment();
    apiRequest = env.apiRequest;
    teardown = env.teardown;

    const hashedPassword = await hashPassword("Password123!");

    // Create VIEWER
    await User.create({
      name: "Viewer User",
      email: "viewer@example.com",
      passwordHash: hashedPassword,
      role: "VIEWER",
      isActive: true,
    });

    // Create AUTHOR
    await User.create({
      name: "Author User",
      email: "author@example.com",
      passwordHash: hashedPassword,
      role: "AUTHOR",
      isActive: true,
    });

    // Create ROOT
    await User.create({
      name: "Root User",
      email: "root@example.com",
      passwordHash: hashedPassword,
      role: "ROOT",
      isActive: true,
    });

    // Login each to obtain session cookies
    const viewerLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "viewer@example.com", password: "Password123!" },
    });
    viewerCookie = viewerLogin.setCookie;

    const authorLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "author@example.com", password: "Password123!" },
    });
    authorCookie = authorLogin.setCookie;

    const rootLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "root@example.com", password: "Password123!" },
    });
    rootCookie = rootLogin.setCookie;
  });

  after(async () => {
    if (teardown) await teardown();
  });

  describe("Unauthenticated Access", () => {
    it("should return 401 on /api/test/viewer without auth", async () => {
      const res = await apiRequest("/api/test/viewer");
      assert.equal(res.status, 401);
    });

    it("should return 401 on /api/test/author without auth", async () => {
      const res = await apiRequest("/api/test/author");
      assert.equal(res.status, 401);
    });

    it("should return 401 on /api/test/root without auth", async () => {
      const res = await apiRequest("/api/test/root");
      assert.equal(res.status, 401);
    });
  });

  describe("VIEWER Access", () => {
    it("should ALLOW VIEWER on /api/test/viewer (200)", async () => {
      const res = await apiRequest("/api/test/viewer", { cookie: viewerCookie });
      assert.equal(res.status, 200);
      assert.equal(res.data.message, "Viewer access granted");
    });

    it("should DENY VIEWER on /api/test/author (403)", async () => {
      const res = await apiRequest("/api/test/author", { cookie: viewerCookie });
      assert.equal(res.status, 403);
    });

    it("should DENY VIEWER on /api/test/root (403)", async () => {
      const res = await apiRequest("/api/test/root", { cookie: viewerCookie });
      assert.equal(res.status, 403);
    });
  });

  describe("AUTHOR Access", () => {
    it("should ALLOW AUTHOR on /api/test/viewer (200)", async () => {
      const res = await apiRequest("/api/test/viewer", { cookie: authorCookie });
      assert.equal(res.status, 200);
    });

    it("should ALLOW AUTHOR on /api/test/author (200)", async () => {
      const res = await apiRequest("/api/test/author", { cookie: authorCookie });
      assert.equal(res.status, 200);
      assert.equal(res.data.message, "Author access granted");
    });

    it("should DENY AUTHOR on /api/test/root (403)", async () => {
      const res = await apiRequest("/api/test/root", { cookie: authorCookie });
      assert.equal(res.status, 403);
    });
  });

  describe("ROOT Access", () => {
    it("should ALLOW ROOT on /api/test/viewer (200)", async () => {
      const res = await apiRequest("/api/test/viewer", { cookie: rootCookie });
      assert.equal(res.status, 200);
    });

    it("should ALLOW ROOT on /api/test/author (200)", async () => {
      const res = await apiRequest("/api/test/author", { cookie: rootCookie });
      assert.equal(res.status, 200);
    });

    it("should ALLOW ROOT on /api/test/root (200)", async () => {
      const res = await apiRequest("/api/test/root", { cookie: rootCookie });
      assert.equal(res.status, 200);
      assert.equal(res.data.message, "Root access granted");
    });
  });
});
