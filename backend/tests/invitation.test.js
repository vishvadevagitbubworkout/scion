import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { setupTestEnvironment } from "./testHelper.js";
import User from "../src/models/User.js";
import Invitation from "../src/models/Invitation.js";
import { hashPassword } from "../src/utils/password.js";

function sha256(val) {
  return crypto.createHash("sha256").update(val).digest("hex");
}

describe("Phase 3 — Author Invitation & Management", () => {
  let apiRequest;
  let teardown;

  let rootUser;
  let authorUser;
  let viewerUser;

  let rootCookie;
  let authorCookie;
  let viewerCookie;

  before(async () => {
    const env = await setupTestEnvironment();
    apiRequest = env.apiRequest;
    teardown = env.teardown;

    const pwdHash = await hashPassword("Password123!");

    // Seed Root User
    rootUser = await User.create({
      name: "Root Administrator",
      email: "root@example.com",
      passwordHash: pwdHash,
      role: "ROOT",
      isActive: true,
    });

    // Seed Author User
    authorUser = await User.create({
      name: "Existing Author",
      email: "author@example.com",
      passwordHash: pwdHash,
      role: "AUTHOR",
      isActive: true,
    });

    // Seed Viewer User
    viewerUser = await User.create({
      name: "Normal Viewer",
      email: "viewer@example.com",
      passwordHash: pwdHash,
      role: "VIEWER",
      isActive: true,
    });

    // Obtain session cookies
    const rootLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "root@example.com", password: "Password123!" },
    });
    rootCookie = rootLogin.setCookie;

    const authorLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "author@example.com", password: "Password123!" },
    });
    authorCookie = authorLogin.setCookie;

    const viewerLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "viewer@example.com", password: "Password123!" },
    });
    viewerCookie = viewerLogin.setCookie;
  });

  after(async () => {
    if (teardown) await teardown();
  });

  describe("1. Invitation Creation & Role Authorization", () => {
    it("ROOT can create an author invitation", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "invitee1@example.com" },
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.message, "Author invitation created successfully");
      assert.ok(res.data.invitation);
      assert.equal(res.data.invitation.email, "invitee1@example.com");
      assert.equal(res.data.invitation.status, "PENDING");
      assert.equal(res.data.invitation.role, "AUTHOR");
      assert.ok(res.data.invitationToken);
      assert.equal(res.data.invitationToken.length, 64);
      assert.ok(res.data.otp);
      assert.match(res.data.otp, /^\d{6}$/);

      // Verify hashes are never returned in HTTP response
      assert.equal(res.data.invitation.tokenHash, undefined);
      assert.equal(res.data.invitation.otpHash, undefined);
      assert.equal(res.data.invitation.setupTokenHash, undefined);

      // Verify in DB that tokenHash and otpHash are securely stored
      const inDb = await Invitation.findById(res.data.invitation.id).select(
        "+tokenHash +otpHash"
      );
      assert.ok(inDb);
      assert.equal(inDb.tokenHash, sha256(res.data.invitationToken));
      assert.ok(inDb.otpHash.startsWith("$argon2"));
      assert.notEqual(inDb.otpHash, res.data.otp);
    });

    it("AUTHOR cannot create an invitation (403 Forbidden)", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: authorCookie,
        body: { email: "fail1@example.com" },
      });
      assert.equal(res.status, 403);
    });

    it("VIEWER cannot create an invitation (403 Forbidden)", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: viewerCookie,
        body: { email: "fail2@example.com" },
      });
      assert.equal(res.status, 403);
    });

    it("Anonymous user cannot create an invitation (401 Unauthorized)", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        body: { email: "fail3@example.com" },
      });
      assert.equal(res.status, 401);
    });

    it("Rejects invalid email format with 400 Bad Request", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "not-an-email" },
      });
      assert.equal(res.status, 400);
    });

    it("Rejects invitation if email already belongs to a registered User (409 Conflict)", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "viewer@example.com" },
      });
      assert.equal(res.status, 409);
      assert.match(res.data.message, /already registered/i);
    });

    it("Rejects duplicate active pending invitation for the same email (409 Conflict)", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "invitee1@example.com" },
      });
      assert.equal(res.status, 409);
      assert.match(res.data.message, /active pending invitation/i);
    });
  });

  describe("2. ROOT Oversight & Revocation", () => {
    it("ROOT can list all invitations", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "GET",
        cookie: rootCookie,
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.invitations));
      assert.ok(res.data.invitations.length >= 1);

      // Verify safe fields and no hash leakage
      const inv = res.data.invitations[0];
      assert.ok(inv.email);
      assert.ok(inv.status);
      assert.equal(inv.tokenHash, undefined);
      assert.equal(inv.otpHash, undefined);
    });

    it("Non-ROOT cannot list invitations", async () => {
      const res1 = await apiRequest("/api/invitations", {
        method: "GET",
        cookie: viewerCookie,
      });
      assert.equal(res1.status, 403);

      const res2 = await apiRequest("/api/invitations", {
        method: "GET",
      });
      assert.equal(res2.status, 401);
    });

    it("ROOT can revoke a pending invitation", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "to-revoke@example.com" },
      });

      const invId = createRes.data.invitation.id;
      const revokeRes = await apiRequest(`/api/invitations/${invId}/revoke`, {
        method: "PATCH",
        cookie: rootCookie,
      });

      assert.equal(revokeRes.status, 200);
      assert.equal(revokeRes.data.invitation.status, "REVOKED");
      assert.ok(revokeRes.data.invitation.revokedAt);

      // Verify revoked invitation cannot be revoked again
      const secondRevoke = await apiRequest(`/api/invitations/${invId}/revoke`, {
        method: "PATCH",
        cookie: rootCookie,
      });
      assert.equal(secondRevoke.status, 400);

      // Verify revoked invitation token is rejected during validation
      const validateRes = await apiRequest(
        `/api/invitations/validate?token=${createRes.data.invitationToken}`
      );
      assert.equal(validateRes.status, 400);
      assert.match(validateRes.data.message, /revoked/i);
    });
  });

  describe("3. Invitation Token Validation (Public)", () => {
    it("Valid invitation token returns 200 and safe email", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "validate-test@example.com" },
      });

      const res = await apiRequest(
        `/api/invitations/validate?token=${createRes.data.invitationToken}`
      );
      assert.equal(res.status, 200);
      assert.equal(res.data.valid, true);
      assert.equal(res.data.email, "validate-test@example.com");
      assert.ok(res.data.expiresAt);
      assert.equal(res.data.otp, undefined);
      assert.equal(res.data.tokenHash, undefined);
    });

    it("Rejects non-existent / invalid token with 404", async () => {
      const res = await apiRequest(
        "/api/invitations/validate?token=0000000000000000000000000000000000000000000000000000000000000000"
      );
      assert.equal(res.status, 404);
    });

    it("Rejects expired invitation with 410 Gone (3-Day Expiry Enforced)", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "expired-test@example.com" },
      });

      // Simulate expiration: update expiresAt to 1 hour in the past
      await Invitation.findByIdAndUpdate(createRes.data.invitation.id, {
        expiresAt: new Date(Date.now() - 3600 * 1000),
      });

      const res = await apiRequest(
        `/api/invitations/validate?token=${createRes.data.invitationToken}`
      );
      assert.equal(res.status, 410);
      assert.match(res.data.message, /expired/i);
    });
  });

  describe("4. OTP Verification & Attempt Protection", () => {
    it("Correct OTP returns short-lived setupToken", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "otp-success@example.com" },
      });

      const { invitationToken, otp } = createRes.data;

      const res = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.message, "OTP verified successfully");
      assert.ok(res.data.setupToken);
      assert.equal(res.data.setupToken.length, 64);
      assert.ok(res.data.expiresIn > 0);
      assert.ok(res.data.expiresIn <= 900); // 15 mins max
    });

    it("Incorrect OTP increments attempt counter and returns remaining attempts", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "otp-fail@example.com" },
      });

      const { invitationToken } = createRes.data;

      const res = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp: "000000" },
      });

      assert.equal(res.status, 400);
      assert.match(res.data.message, /4 attempt\(s\) remaining/i);
      assert.equal(res.data.remainingAttempts, 4);

      // Verify attempts incremented in DB
      const inDb = await Invitation.findById(createRes.data.invitation.id);
      assert.equal(inDb.otpAttempts, 1);
    });

    it("Fifth consecutive failed OTP attempt revokes invitation (429)", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "bruteforce-test@example.com" },
      });

      const { invitationToken } = createRes.data;

      // Fail 4 times
      for (let i = 0; i < 4; i++) {
        const failRes = await apiRequest("/api/invitations/verify-otp", {
          method: "POST",
          body: { token: invitationToken, otp: "000000" },
        });
        assert.equal(failRes.status, 400);
      }

      // 5th failure
      const fifthRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp: "000000" },
      });
      assert.equal(fifthRes.status, 429);
      assert.match(fifthRes.data.message, /maximum otp verification attempts/i);

      // Verify status is REVOKED in DB
      const inDb = await Invitation.findById(createRes.data.invitation.id);
      assert.equal(inDb.status, "REVOKED");

      // 6th attempt with real OTP fails immediately
      const sixthRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp: createRes.data.otp },
      });
      assert.equal(sixthRes.status, 400); // Revoked invitation
    });
  });

  describe("5. Account Setup Completion & RBAC Integration", () => {
    it("Completes setup, creates AUTHOR user, and automatically logs in", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "new-author@example.com" },
      });

      const { invitationToken, otp } = createRes.data;

      // 1. Verify OTP
      const verifyRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp },
      });
      const setupToken = verifyRes.data.setupToken;

      // 2. Complete setup
      const completeRes = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          name: "Dr. New Author",
          password: "AuthorPassword123!",
        },
      });

      assert.equal(completeRes.status, 201);
      assert.equal(completeRes.data.message, "Author account created successfully");
      assert.equal(completeRes.data.user.name, "Dr. New Author");
      assert.equal(completeRes.data.user.email, "new-author@example.com");
      assert.equal(completeRes.data.user.role, "AUTHOR");
      assert.equal(completeRes.data.user.passwordHash, undefined);

      // Verify HttpOnly cookie is set
      assert.ok(completeRes.setCookie);
      assert.ok(completeRes.setCookie.includes("scion_access_token="));
      assert.ok(completeRes.setCookie.toLowerCase().includes("httponly"));

      // Verify invitation in DB is ACCEPTED and hashes wiped
      const inDb = await Invitation.findById(createRes.data.invitation.id).select(
        "+setupTokenHash +otpHash"
      );
      assert.equal(inDb.status, "ACCEPTED");
      assert.ok(inDb.usedAt);
      assert.equal(inDb.setupTokenHash, null);
      assert.equal(inDb.otpHash, undefined); // removed/unset

      // 3. Verify user in User collection
      const dbUser = await User.findOne({ email: "new-author@example.com" }).select(
        "+passwordHash"
      );
      assert.ok(dbUser);
      assert.equal(dbUser.role, "AUTHOR");
      assert.equal(dbUser.isActive, true);
      assert.ok(dbUser.passwordHash.startsWith("$argon2"));

      // 4. Verify new author can log in via standard Phase 1 /api/auth/login
      const loginRes = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
          email: "new-author@example.com",
          password: "AuthorPassword123!",
        },
      });
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.data.user.role, "AUTHOR");
    });

    it("Setup token cannot be reused (one-time use)", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "reuse-test@example.com" },
      });

      const { invitationToken, otp } = createRes.data;
      const verifyRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp },
      });
      const setupToken = verifyRes.data.setupToken;

      // First use succeeds
      const firstRes = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          name: "Reuse User",
          password: "AuthorPassword123!",
        },
      });
      assert.equal(firstRes.status, 201);

      // Second use of the same setupToken fails
      const secondRes = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          name: "Replay Attempt",
          password: "AuthorPassword123!",
        },
      });
      assert.ok(
        secondRes.status === 400 || secondRes.status === 409,
        `Expected 400 or 409, got ${secondRes.status}`
      );
    });

    it("Concurrent completion requests cannot create duplicate users", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "concurrent-test@example.com" },
      });

      const { invitationToken, otp } = createRes.data;
      const verifyRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp },
      });
      const setupToken = verifyRes.data.setupToken;

      const [res1, res2] = await Promise.all([
        apiRequest("/api/invitations/complete", {
          method: "POST",
          body: {
            setupToken,
            name: "Concurrent 1",
            password: "AuthorPassword123!",
          },
        }),
        apiRequest("/api/invitations/complete", {
          method: "POST",
          body: {
            setupToken,
            name: "Concurrent 2",
            password: "AuthorPassword123!",
          },
        }),
      ]);

      const statuses = [res1.status, res2.status];
      assert.equal(statuses.filter((s) => s === 201).length, 1);
      assert.equal(statuses.filter((s) => s === 400 || s === 409).length, 1);

      const users = await User.find({ email: "concurrent-test@example.com" });
      assert.equal(users.length, 1);
    });

    it("Cannot inject role: ROOT during completion", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "role-inject@example.com" },
      });

      const { invitationToken, otp } = createRes.data;
      const verifyRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp },
      });
      const setupToken = verifyRes.data.setupToken;

      const res = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          name: "Attacker",
          password: "AuthorPassword123!",
          role: "ROOT",
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.user.role, "AUTHOR");

      const inDb = await User.findOne({ email: "role-inject@example.com" });
      assert.equal(inDb.role, "AUTHOR");
    });

    it("Expired setup token is rejected with 410 Gone", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "token-expired@example.com" },
      });

      const { invitationToken, otp } = createRes.data;
      const verifyRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp },
      });
      const setupToken = verifyRes.data.setupToken;

      // Simulate setup token expiration: set setupTokenExpiresAt in the past
      await Invitation.findByIdAndUpdate(createRes.data.invitation.id, {
        setupTokenExpiresAt: new Date(Date.now() - 1000),
      });

      const completeRes = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          name: "Expired Token User",
          password: "AuthorPassword123!",
        },
      });

      assert.equal(completeRes.status, 410);
    });

    it("Rejects completion if email becomes registered between invite and setup (409 Conflict)", async () => {
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "collision-test@example.com" },
      });

      const { invitationToken, otp } = createRes.data;
      const verifyRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp },
      });
      const setupToken = verifyRes.data.setupToken;

      // Pre-register user with same email (collision)
      await User.create({
        name: "Collision User",
        email: "collision-test@example.com",
        passwordHash: await hashPassword("Collision123!"),
        role: "VIEWER",
        isActive: true,
      });

      const completeRes = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          name: "Collision Author",
          password: "AuthorPassword123!",
        },
      });

      assert.equal(completeRes.status, 409);
      assert.match(completeRes.data.message, /already registered/i);

      // Verify invitation did NOT become ACCEPTED
      const inDb = await Invitation.findById(createRes.data.invitation.id);
      assert.notEqual(inDb.status, "ACCEPTED");
    });
  });

  describe("6. Phase 2 Journal Management Integration", () => {
    it("Newly created AUTHOR can immediately create and publish journals in Phase 2", async () => {
      // 1. Create and complete an author
      const createRes = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "phase2-author@example.com" },
      });

      const { invitationToken, otp } = createRes.data;
      const verifyRes = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        body: { token: invitationToken, otp },
      });

      const completeRes = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken: verifyRes.data.setupToken,
          name: "Prof. Phase 2 Author",
          password: "AuthorPassword123!",
        },
      });

      const authorSessionCookie = completeRes.setCookie;

      // 2. Author creates journal via Phase 2 POST /api/journals
      const journalRes = await apiRequest("/api/journals", {
        method: "POST",
        cookie: authorSessionCookie,
        body: {
          title: "New Research on Quantum Computing",
          abstract: "Abstract on quantum computing algorithms.",
          content: "Detailed body content about quantum gates and qubits.",
          domain: "Physics",
        },
      });

      assert.equal(journalRes.status, 201);
      assert.equal(journalRes.data.journal.title, "New Research on Quantum Computing");
      assert.equal(journalRes.data.journal.status, "DRAFT");
      assert.equal(journalRes.data.journal.authorId, completeRes.data.user.id);

      const journalId = journalRes.data.journal.id;

      // 3. Author sees journal in GET /api/journals/my
      const myJournalsRes = await apiRequest("/api/journals/my", {
        method: "GET",
        cookie: authorSessionCookie,
      });
      assert.equal(myJournalsRes.status, 200);
      assert.equal(myJournalsRes.data.journals.length, 1);
      assert.equal(myJournalsRes.data.journals[0].id, journalId);

      // 4. Author publishes journal via Phase 2 PATCH /api/journals/:id/publish
      const publishRes = await apiRequest(`/api/journals/${journalId}/publish`, {
        method: "PATCH",
        cookie: authorSessionCookie,
      });
      assert.equal(publishRes.status, 200);
      assert.equal(publishRes.data.journal.status, "PUBLISHED");
      assert.ok(publishRes.data.journal.publishedAt);
    });

    it("VIEWER still cannot create journals (403 Forbidden)", async () => {
      const res = await apiRequest("/api/journals", {
        method: "POST",
        cookie: viewerCookie,
        body: {
          title: "Unauthorized Journal",
          abstract: "Abstract",
          content: "Content",
          domain: "General",
        },
      });
      assert.equal(res.status, 403);
    });
  });
});
