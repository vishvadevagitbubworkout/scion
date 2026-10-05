import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { setupTestEnvironment } from "./testHelper.js";
import User from "../src/models/User.js";
import Invitation from "../src/models/Invitation.js";
import EmailVerification from "../src/models/EmailVerification.js";
import { hashPassword } from "../src/utils/password.js";
import { getSentEmails, clearSentEmails } from "../src/services/emailService.js";

function sha256(val) {
  return crypto.createHash("sha256").update(val).digest("hex");
}

function uniqueEmail(prefix = "user") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`;
}

describe("Phase 3 — Author Invitation & Management (Final Revised Specification)", () => {
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
      username: "rootadmin",
      email: "root@example.com",
      passwordHash: pwdHash,
      role: "ROOT",
      isActive: true,
    });

    // Seed Author User
    authorUser = await User.create({
      name: "Existing Author",
      username: "existingauthor",
      email: "author@example.com",
      passwordHash: pwdHash,
      role: "AUTHOR",
      isActive: true,
    });

    // Seed Viewer User
    viewerUser = await User.create({
      name: "Normal Viewer",
      username: "normalviewer",
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

  beforeEach(() => {
    clearSentEmails();
  });

  /**
   * Helper: Sends OTP and verifies it, returning verificationToken
   */
  async function helperSendAndVerifyOtp(email, cookie = rootCookie) {
    const sendRes = await apiRequest("/api/invitations/send-otp", {
      method: "POST",
      cookie,
      body: { email },
    });
    if (sendRes.status !== 200) {
      throw new Error(`send-otp failed with ${sendRes.status}: ${JSON.stringify(sendRes.data)}`);
    }

    const sent = getSentEmails();
    const latestEmail = sent[sent.length - 1];
    const otp = latestEmail.otp;

    const verifyRes = await apiRequest("/api/invitations/verify-otp", {
      method: "POST",
      cookie,
      body: { email, otp },
    });
    if (verifyRes.status !== 200) {
      throw new Error(`verify-otp failed with ${verifyRes.status}: ${JSON.stringify(verifyRes.data)}`);
    }

    return verifyRes.data.verificationToken;
  }

  /**
   * Helper: Fully creates an invitation and returns raw invitationToken from the sent email
   */
  async function helperCreateInvitation(email, cookie = rootCookie) {
    const verificationToken = await helperSendAndVerifyOtp(email, cookie);
    clearSentEmails();

    const createRes = await apiRequest("/api/invitations", {
      method: "POST",
      cookie,
      body: { email, verificationToken },
    });
    if (createRes.status !== 201) {
      throw new Error(`create invitation failed with ${createRes.status}: ${JSON.stringify(createRes.data)}`);
    }

    const sent = getSentEmails();
    const latestEmail = sent[sent.length - 1];
    const match = latestEmail.invitationUrl.match(/token=([a-f0-9]{64})/);
    const rawToken = match ? match[1] : null;

    return {
      invitation: createRes.data.invitation,
      rawToken,
    };
  }

  describe("1. OTP Generation & Verification Flow (/send-otp & /verify-otp)", () => {
    it("ROOT can send verification OTP to invitee email", async () => {
      const email = uniqueEmail("otp_root");
      const res = await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.message);
      // OTP is NEVER returned in the API response
      assert.equal(res.data.otp, undefined);

      // Verify email was queued by emailService
      const sent = getSentEmails();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, email);
      assert.ok(sent[0].subject.includes("Verification"));
      assert.ok(sent[0].otp);
      assert.match(sent[0].otp, /^\d{6}$/);

      // Verify DB record stores Argon2id hash, not plaintext
      const record = await EmailVerification.findOne({ email }).select("+otpHash");
      assert.ok(record);
      assert.ok(record.otpHash.startsWith("$argon2"));
      assert.notEqual(record.otpHash, sent[0].otp);
      assert.equal(record.verified, false);
      assert.equal(record.otpAttempts, 0);
    });

    it("AUTHOR can also send verification OTP (unlimited author invitations)", async () => {
      const email = uniqueEmail("otp_author");
      const res = await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: authorCookie,
        body: { email },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);

      const sent = getSentEmails();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, email);
    });

    it("VIEWER cannot send verification OTP (403 Forbidden)", async () => {
      const email = uniqueEmail("otp_viewer");
      const res = await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: viewerCookie,
        body: { email },
      });

      assert.equal(res.status, 403);
    });

    it("Anonymous user cannot send verification OTP (401 Unauthorized)", async () => {
      const email = uniqueEmail("otp_anon");
      const res = await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        body: { email },
      });

      assert.equal(res.status, 401);
    });

    it("Rejects send-otp for already registered user email (409 Conflict)", async () => {
      const res = await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "author@example.com" },
      });

      assert.equal(res.status, 409);
    });

    it("Rejects send-otp for invalid email format (400 Bad Request)", async () => {
      const res = await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email: "not-an-email" },
      });

      assert.equal(res.status, 400);
    });

    it("OTP verification fails with incorrect OTP and tracks attempts", async () => {
      const email = uniqueEmail("wrong_otp");
      await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email },
      });

      const res = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email, otp: "000000" },
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.remainingAttempts, 4);

      const record = await EmailVerification.findOne({ email });
      assert.equal(record.otpAttempts, 1);
    });

    it("Locks out after 5 consecutive incorrect OTP attempts", async () => {
      const email = uniqueEmail("lockout_otp");
      await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email },
      });

      for (let i = 1; i <= 4; i++) {
        await apiRequest("/api/invitations/verify-otp", {
          method: "POST",
          cookie: rootCookie,
          body: { email, otp: "111111" },
        });
      }

      // 5th attempt triggers lockout (429)
      const res5 = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email, otp: "111111" },
      });
      assert.equal(res5.status, 429);
    });

    it("Verifies correct OTP and issues verificationToken", async () => {
      const email = uniqueEmail("correct_otp");
      await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email },
      });

      const sent = getSentEmails();
      const actualOtp = sent[0].otp;

      const res = await apiRequest("/api/invitations/verify-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email, otp: actualOtp },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.verificationToken);
      assert.equal(res.data.verificationToken.length, 64);

      // Verify DB record is marked verified with hashed verificationToken
      const record = await EmailVerification.findOne({ email }).select(
        "+verificationTokenHash"
      );
      assert.equal(record.verified, true);
      assert.equal(record.verificationTokenHash, sha256(res.data.verificationToken));
    });
  });

  describe("2. Invitation Creation (/api/invitations) with 2-Hour Expiration", () => {
    it("Rejects invitation creation without verificationToken (400 Bad Request)", async () => {
      const email = uniqueEmail("noverif");
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email },
      });

      assert.equal(res.status, 400);
    });

    it("Rejects invitation creation with invalid or unverified verificationToken", async () => {
      const email = uniqueEmail("fakeverif");
      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email, verificationToken: "fake_token_12345678" },
      });

      assert.equal(res.status, 400);
    });

    it("Successfully creates invitation with EXACTLY 2 HOURS expiry and sends email", async () => {
      const email = uniqueEmail("invite_2hr");
      const beforeTime = Date.now();

      const verificationToken = await helperSendAndVerifyOtp(email, rootCookie);
      clearSentEmails();

      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: rootCookie,
        body: { email, verificationToken },
      });

      assert.equal(res.status, 201);
      assert.ok(res.data.invitation);
      assert.equal(res.data.invitation.email, email);
      assert.equal(res.data.invitation.status, "PENDING");
      assert.equal(res.data.invitation.role, "AUTHOR");

      // Verify raw invitation token is NOT returned in API response
      assert.equal(res.data.invitationToken, undefined);
      assert.equal(res.data.otp, undefined);
      assert.equal(res.data.invitation.tokenHash, undefined);

      // Verify expiration is EXACTLY 2 HOURS (within 5 seconds tolerance)
      const expiry = new Date(res.data.invitation.expiresAt).getTime();
      const expectedExpiry = beforeTime + 2 * 60 * 60 * 1000;
      assert.ok(Math.abs(expiry - expectedExpiry) < 5000, `Expected ~${expectedExpiry}, got ${expiry}`);

      // Verify email was sent with invitation URL
      const sent = getSentEmails();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, email);
      assert.ok(sent[0].invitationUrl.includes("/accept-invitation?token="));

      // Extract raw token from sent email URL
      const match = sent[0].invitationUrl.match(/token=([a-f0-9]{64})/);
      assert.ok(match, "Invitation URL must contain 64-char hex token");
      const rawToken = match[1];

      // Verify DB stores only SHA-256 hash
      const inDb = await Invitation.findById(res.data.invitation.id).select("+tokenHash");
      assert.equal(inDb.tokenHash, sha256(rawToken));

      // Verification record should be consumed (one-time use)
      const verRecord = await EmailVerification.findOne({ email });
      assert.equal(verRecord, null);
    });

    it("AUTHOR can create invitations without limit", async () => {
      const email = uniqueEmail("peer_author");
      const verificationToken = await helperSendAndVerifyOtp(email, authorCookie);

      const res = await apiRequest("/api/invitations", {
        method: "POST",
        cookie: authorCookie,
        body: { email, verificationToken },
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.invitation.email, email);
      assert.equal(res.data.invitation.role, "AUTHOR");
    });

    it("Rejects duplicate active invitation for same email (409 Conflict)", async () => {
      const email = uniqueEmail("dup_invite");
      // First invitation
      await helperCreateInvitation(email, rootCookie);

      // Try sending OTP again for same email with active invite
      const res = await apiRequest("/api/invitations/send-otp", {
        method: "POST",
        cookie: rootCookie,
        body: { email },
      });

      assert.equal(res.status, 409);
    });
  });

  describe("3. Invitation Token Validation & Setup Token (/api/invitations/validate)", () => {
    it("Validates valid invitation token and issues short-lived setupToken", async () => {
      const email = uniqueEmail("val_token");
      const { rawToken } = await helperCreateInvitation(email, rootCookie);

      const res = await apiRequest(`/api/invitations/validate?token=${rawToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.data.valid, true);
      assert.equal(res.data.email, email);
      assert.ok(res.data.setupToken);
      assert.equal(res.data.setupToken.length, 64);

      // Verify setupToken is hashed in database
      const inDb = await Invitation.findOne({ email }).select(
        "+setupTokenHash +setupTokenExpiresAt"
      );
      assert.equal(inDb.setupTokenHash, sha256(res.data.setupToken));
      assert.ok(inDb.setupTokenExpiresAt > new Date());
    });

    it("Rejects non-existent token with 404 Not Found", async () => {
      const fakeToken = crypto.randomBytes(32).toString("hex");
      const res = await apiRequest(`/api/invitations/validate?token=${fakeToken}`);

      assert.equal(res.status, 404);
    });

    it("Rejects expired invitation with 410 Gone (Strict 2-hour enforcement)", async () => {
      const email = uniqueEmail("exp_token");
      const { rawToken } = await helperCreateInvitation(email, rootCookie);

      // Artificially age the invitation past 2 hours
      await Invitation.findOneAndUpdate(
        { email },
        { expiresAt: new Date(Date.now() - 1000) }
      );

      const res = await apiRequest(`/api/invitations/validate?token=${rawToken}`);

      assert.equal(res.status, 410);

      const inDb = await Invitation.findOne({ email });
      assert.equal(inDb.status, "EXPIRED");
    });

    it("Rejects revoked invitation with 400 Bad Request", async () => {
      const email = uniqueEmail("rev_token");
      const { invitation, rawToken } = await helperCreateInvitation(email, rootCookie);

      await apiRequest(`/api/invitations/${invitation.id}/revoke`, {
        method: "PATCH",
        cookie: rootCookie,
      });

      const res = await apiRequest(`/api/invitations/validate?token=${rawToken}`);

      assert.equal(res.status, 400);
    });
  });

  describe("4. Account Setup Completion (/api/invitations/complete)", () => {
    it("Creates AUTHOR account with username and password, returns session cookie", async () => {
      const email = uniqueEmail("complete_ok");
      const { rawToken } = await helperCreateInvitation(email, rootCookie);

      const valRes = await apiRequest(`/api/invitations/validate?token=${rawToken}`);
      const setupToken = valRes.data.setupToken;

      const res = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          username: "drsmith",
          password: "SecurePassword123!",
          confirmPassword: "SecurePassword123!",
        },
      });

      assert.equal(res.status, 201);
      assert.ok(res.data.user);
      assert.equal(res.data.user.username, "drsmith");
      assert.equal(res.data.user.email, email);
      assert.equal(res.data.user.role, "AUTHOR");

      // Verify HttpOnly cookie was set
      assert.ok(res.setCookie);
      assert.ok(res.setCookie.includes("token="));

      // Verify User in DB has AUTHOR role
      const userInDb = await User.findOne({ email });
      assert.ok(userInDb);
      assert.equal(userInDb.role, "AUTHOR");
      assert.equal(userInDb.username, "drsmith");

      // Verify Invitation status is ACCEPTED and setupToken is invalidated
      const invInDb = await Invitation.findOne({ email }).select(
        "+setupTokenHash +setupTokenExpiresAt"
      );
      assert.equal(invInDb.status, "ACCEPTED");
      assert.ok(!invInDb.setupTokenHash);
      assert.ok(!invInDb.setupTokenExpiresAt);
    });

    it("Rejects reused setupToken with 400/409", async () => {
      const email = uniqueEmail("reuse_token");
      const { rawToken } = await helperCreateInvitation(email, rootCookie);

      const valRes = await apiRequest(`/api/invitations/validate?token=${rawToken}`);
      const setupToken = valRes.data.setupToken;

      // First completion
      await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          username: "firstuser",
          password: "SecurePassword123!",
          confirmPassword: "SecurePassword123!",
        },
      });

      // Second completion with same setupToken
      const res2 = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          username: "seconduser",
          password: "SecurePassword123!",
          confirmPassword: "SecurePassword123!",
        },
      });

      assert.ok([400, 409].includes(res2.status));
    });

    it("Rejects duplicate username (409 Conflict)", async () => {
      const email = uniqueEmail("dup_username");
      const { rawToken } = await helperCreateInvitation(email, rootCookie);

      const valRes = await apiRequest(`/api/invitations/validate?token=${rawToken}`);
      const setupToken = valRes.data.setupToken;

      // Seed a user with username 'existingusername'
      await User.create({
        name: "Duplicate Tester",
        username: "duplicateuser",
        email: uniqueEmail("dup_existing"),
        passwordHash: await hashPassword("Password123!"),
        role: "AUTHOR",
      });

      const res = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          username: "duplicateuser",
          password: "SecurePassword123!",
          confirmPassword: "SecurePassword123!",
        },
      });

      assert.equal(res.status, 409);
    });

    it("Rejects password mismatch", async () => {
      const email = uniqueEmail("pass_mismatch");
      const { rawToken } = await helperCreateInvitation(email, rootCookie);

      const valRes = await apiRequest(`/api/invitations/validate?token=${rawToken}`);
      const setupToken = valRes.data.setupToken;

      const res = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          username: "validuser1",
          password: "Password123!",
          confirmPassword: "DifferentPassword123!",
        },
      });

      assert.equal(res.status, 400);
      assert.ok(res.data.errors.includes("Passwords do not match"));
    });

    it("Rejects invalid username formats", async () => {
      const email = uniqueEmail("bad_username");
      const { rawToken } = await helperCreateInvitation(email, rootCookie);

      const valRes = await apiRequest(`/api/invitations/validate?token=${rawToken}`);
      const setupToken = valRes.data.setupToken;

      const res = await apiRequest("/api/invitations/complete", {
        method: "POST",
        body: {
          setupToken,
          username: "no spaces allowed!",
          password: "Password123!",
          confirmPassword: "Password123!",
        },
      });

      assert.equal(res.status, 400);
    });
  });

  describe("5. Authentication via Email OR Username", () => {
    before(async () => {
      const pwd = await hashPassword("AuthTestPass123!");
      await User.create({
        name: "Dual Auth User",
        username: "dualuser",
        email: "dual@example.com",
        passwordHash: pwd,
        role: "AUTHOR",
      });
    });

    it("Can login using EMAIL and password", async () => {
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
          email: "dual@example.com",
          password: "AuthTestPass123!",
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.user.email, "dual@example.com");
      assert.equal(res.data.user.username, "dualuser");
      assert.equal(res.data.user.role, "AUTHOR");
    });

    it("Can login using USERNAME and password", async () => {
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
          email: "dualuser", // passing username in the login handle field
          password: "AuthTestPass123!",
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.user.email, "dual@example.com");
      assert.equal(res.data.user.username, "dualuser");
      assert.equal(res.data.user.role, "AUTHOR");
    });

    it("Fails login with incorrect password for username", async () => {
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
          email: "dualuser",
          password: "WrongPassword!",
        },
      });

      assert.equal(res.status, 401);
    });
  });

  describe("6. Revocation and Listing Permissions", () => {
    it("ROOT can list all invitations", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "GET",
        cookie: rootCookie,
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.invitations));
    });

    it("AUTHOR can list their invitations", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "GET",
        cookie: authorCookie,
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.invitations));
    });

    it("VIEWER cannot list invitations (403 Forbidden)", async () => {
      const res = await apiRequest("/api/invitations", {
        method: "GET",
        cookie: viewerCookie,
      });

      assert.equal(res.status, 403);
    });

    it("AUTHOR can revoke an invitation they created", async () => {
      const email = uniqueEmail("author_revoke");
      const { invitation } = await helperCreateInvitation(email, authorCookie);

      const res = await apiRequest(`/api/invitations/${invitation.id}/revoke`, {
        method: "PATCH",
        cookie: authorCookie,
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.invitation.status, "REVOKED");
    });

    it("AUTHOR cannot revoke an invitation created by ROOT (403 Forbidden)", async () => {
      const email = uniqueEmail("root_owned");
      const { invitation } = await helperCreateInvitation(email, rootCookie);

      const res = await apiRequest(`/api/invitations/${invitation.id}/revoke`, {
        method: "PATCH",
        cookie: authorCookie,
      });

      assert.equal(res.status, 403);
    });
  });
});
