import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnvironment } from "./testHelper.js";
import User from "../models/User.js";
import { hashPassword } from "../utils/password.js";

describe("Workflow 1, 2, 3: Authentication, Registration, and RBAC Permissions", () => {
  let env;

  before(async () => {
    env = await setupTestEnvironment("scion_test_auth");

    // Create a ROOT user and an AUTHOR user for RBAC testing
    await User.create([
      {
        name: "Root Admin",
        email: "root@example.com",
        passwordHash: await hashPassword("RootAdminPassword123!"),
        role: "ROOT",
        isActive: true,
      },
      {
        name: "Active Author",
        email: "author@example.com",
        passwordHash: await hashPassword("AuthorPassword123!"),
        role: "AUTHOR",
        isActive: true,
      },
    ]);
  });

  after(async () => {
    await env.teardown();
  });

  test("1.1 Public registration strictly creates VIEWER account and ignores role injection", async () => {
    const client = env.createClient();
    const res = await client.post("/api/auth/register", {
      name: "Public Viewer",
      email: "viewer@example.com",
      password: "ViewerPassword123!",
      confirmPassword: "ViewerPassword123!",
      role: "ROOT", // Attacker attempts privilege escalation
    });

    assert.equal(res.status, 201, "Registration should succeed with 201");
    assert.equal(res.body.user.role, "VIEWER", "Role must be VIEWER regardless of payload");

    const dbUser = await User.findOne({ email: "viewer@example.com" });
    assert.ok(dbUser, "User must exist in DB");
    assert.equal(dbUser.role, "VIEWER", "DB document role must strictly be VIEWER");
  });

  test("1.2 Login with valid credentials sets HttpOnly scion_access_token cookie", async () => {
    const client = env.createClient();
    const res = await client.post("/api/auth/login", {
      email: "viewer@example.com",
      password: "ViewerPassword123!",
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, "viewer@example.com");
    assert.ok(client.cookies.has("scion_access_token"), "Must receive scion_access_token cookie");

    // Verify /api/auth/me returns the authenticated user
    const meRes = await client.get("/api/auth/me");
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.role, "VIEWER");
  });

  test("2.1 Logout clears session cookie and revokes /api/auth/me access", async () => {
    const client = env.createClient();
    await client.post("/api/auth/login", {
      email: "viewer@example.com",
      password: "ViewerPassword123!",
    });

    const logoutRes = await client.post("/api/auth/logout");
    assert.equal(logoutRes.status, 200);
    assert.ok(!client.cookies.has("scion_access_token"), "Cookie must be cleared after logout");

    const meRes = await client.get("/api/auth/me");
    assert.equal(meRes.status, 401, "Unauthenticated request to /api/auth/me must return 401");
  });

  test("3.1 VIEWER and unauthenticated users are blocked from ROOT/AUTHOR endpoints", async () => {
    const anonClient = env.createClient();
    const anonRes = await anonClient.post("/api/invitations/send-otp", {
      email: "invitee@example.com",
    });
    assert.equal(anonRes.status, 401, "Unauthenticated request must return 401");

    const viewerClient = env.createClient();
    await viewerClient.post("/api/auth/login", {
      email: "viewer@example.com",
      password: "ViewerPassword123!",
    });

    const viewerRes = await viewerClient.post("/api/invitations/send-otp", {
      email: "invitee@example.com",
    });
    assert.equal(viewerRes.status, 403, "VIEWER role must receive 403 Forbidden");

    const viewerJournalsRes = await viewerClient.get("/api/journals/my");
    assert.equal(viewerJournalsRes.status, 403, "VIEWER must not access /api/journals/my");
  });

  test("3.2 AUTHOR and ROOT are authorized to access author dashboard endpoints", async () => {
    const authorClient = env.createClient();
    await authorClient.post("/api/auth/login", {
      email: "author@example.com",
      password: "AuthorPassword123!",
    });

    const myJournals = await authorClient.get("/api/journals/my");
    assert.equal(myJournals.status, 200, "AUTHOR should be permitted on /api/journals/my");

    const rootClient = env.createClient();
    await rootClient.post("/api/auth/login", {
      email: "root@example.com",
      password: "RootAdminPassword123!",
    });

    const rootJournals = await rootClient.get("/api/journals/my");
    assert.equal(rootJournals.status, 200, "ROOT should be permitted on /api/journals/my");
  });
});
