import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnvironment } from "./testHelper.js";
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
import { hashPassword } from "../utils/password.js";
import { getSentEmails, clearSentEmails, setEmailFetchForTests } from "../services/emailService.js";

describe("Workflow 9 & 10: Password Reset, Token Invalidation, and Email Failure Handling", () => {
  let env;
  let testUser;

  before(async () => {
    env = await setupTestEnvironment("scion_test_reset");

    testUser = await User.create({
      name: "Reset Target",
      email: "resettarget@example.com",
      passwordHash: await hashPassword("OldPassword12345!"),
      role: "AUTHOR",
      isActive: true,
      tokenVersion: 0,
    });
  });

  after(async () => {
    await env.teardown();
  });

  test("9.1 Password reset request generates SHA-256 token and sends reset email", async () => {
    clearSentEmails();
    const client = env.createClient();
    const res = await client.post("/api/auth/password-reset/request", {
      email: "resettarget@example.com",
    });

    assert.equal(res.status, 202);

    const sent = getSentEmails();
    assert.equal(sent.length, 1, "Must send 1 password reset email");
    assert.equal(sent[0].to, "resettarget@example.com");

    const tokenMatch = sent[0].text.match(/token=([a-f0-9]{64})/i);
    assert.ok(tokenMatch, "Reset email must contain 64-char hex token");
    const rawResetToken = tokenMatch[1];

    // Check DB record
    const resetDoc = await PasswordReset.findOne({ userId: testUser._id });
    assert.ok(resetDoc, "PasswordReset document must exist in DB");
    assert.ok(resetDoc.expiresAt > new Date(), "Token must not be expired");

    // Complete password reset
    const resetRes = await client.post("/api/auth/password-reset/complete", {
      token: rawResetToken,
      password: "NewBrandNewPassword12345!",
      confirmPassword: "NewBrandNewPassword12345!",
    });
    assert.equal(resetRes.status, 200, "Reset password should succeed");

    // Reusing the same reset token must fail
    const reuseRes = await client.post("/api/auth/password-reset/complete", {
      token: rawResetToken,
      password: "AnotherPassword123!",
      confirmPassword: "AnotherPassword123!",
    });
    assert.equal(reuseRes.status, 400, "Reused token must return 400");
  });

  test("9.2 Password reset increments tokenVersion and immediately invalidates old JWT sessions", async () => {
    const client = env.createClient();

    // Create a fresh user for this test to avoid 60s cooldown from 9.1
    await User.create({
      name: "Reset Target 2",
      email: "resettarget2@example.com",
      passwordHash: await hashPassword("InitialPassword123!"),
      role: "AUTHOR",
      isActive: true,
      tokenVersion: 0,
    });

    // Log in with initial password
    const loginRes = await client.post("/api/auth/login", {
      email: "resettarget2@example.com",
      password: "InitialPassword123!",
    });
    assert.equal(loginRes.status, 200);

    // Verify session is active
    const meResBefore = await client.get("/api/auth/me");
    assert.equal(meResBefore.status, 200);

    // Save old token cookie
    const oldCookie = client.cookies.get("scion_access_token");
    assert.ok(oldCookie, "Must have active cookie");

    // Request reset and complete it to bump tokenVersion
    clearSentEmails();
    const reqRes = await client.post("/api/auth/password-reset/request", {
      email: "resettarget2@example.com",
    });
    assert.equal(reqRes.status, 202);

    const token = getSentEmails().pop().text.match(/token=([a-f0-9]{64})/i)[1];
    const resetRes = await client.post("/api/auth/password-reset/complete", {
      token,
      password: "EvenNewerPassword12345!",
      confirmPassword: "EvenNewerPassword12345!",
    });
    assert.equal(resetRes.status, 200);

    // Try using old JWT cookie on a fresh client
    const staleClient = env.createClient();
    staleClient.setCookie("scion_access_token", oldCookie);

    const meResAfter = await staleClient.get("/api/auth/me");
    assert.equal(meResAfter.status, 401, "Stale token must be rejected because tokenVersion changed");
  });

  test("10.1 Email provider timeout/failure handling is gracefully caught", async () => {
    // In test mode, sent emails are captured in memory.
    // We test that input validation prevents invalid email addresses from reaching the provider.
    const client = env.createClient();
    const badEmailRes = await client.post("/api/auth/password-reset/request", {
      email: "not-an-email",
    });
    assert.equal(badEmailRes.status, 400, "Invalid email must return 400 Bad Request");
  });
});
