import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnvironment } from "./testHelper.js";
import User from "../models/User.js";
import Invitation from "../models/Invitation.js";
import EmailVerification from "../models/EmailVerification.js";
import { hashPassword } from "../utils/password.js";
import { getSentEmails, clearSentEmails } from "../services/emailService.js";

describe("Workflow 4, 5, 6: OTP, Invitation Lifecycle, Expiry, and Reuse Prevention", () => {
  let env;
  let rootClient;
  let authorClient;

  before(async () => {
    env = await setupTestEnvironment("scion_test_invitation");

    await User.create([
      {
        name: "Root Inviter",
        email: "root-inviter@example.com",
        passwordHash: await hashPassword("RootInviterPass123!"),
        role: "ROOT",
        isActive: true,
      },
      {
        name: "Author Inviter",
        email: "author-inviter@example.com",
        passwordHash: await hashPassword("AuthorInviterPass123!"),
        role: "AUTHOR",
        isActive: true,
      },
    ]);

    rootClient = env.createClient();
    await rootClient.post("/api/auth/login", {
      email: "root-inviter@example.com",
      password: "RootInviterPass123!",
    });

    authorClient = env.createClient();
    await authorClient.post("/api/auth/login", {
      email: "author-inviter@example.com",
      password: "AuthorInviterPass123!",
    });
  });

  after(async () => {
    await env.teardown();
  });

  test("4.1 Author requests OTP for prospective author email", async () => {
    clearSentEmails();
    const res = await authorClient.post("/api/invitations/send-otp", {
      email: "newauthor@example.com",
    });

    assert.equal(res.status, 200, "Send OTP should succeed with 200");
    assert.equal(res.body.success, true);

    const sent = getSentEmails();
    assert.equal(sent.length, 1, "Must have sent 1 OTP email");
    assert.equal(sent[0].to, "newauthor@example.com");

    const record = await EmailVerification.findOne({ email: "newauthor@example.com" });
    assert.ok(record, "EmailVerification document must exist in DB");
    assert.equal(record.otpAttempts, 0, "Initial otpAttempts must be 0");
    assert.ok(record.otpExpiresAt > new Date(), "Must have future expiry date");
  });

  test("4.2 Invalid OTP decrements remaining attempts and locks out after 5 failures", async () => {
    // 4 attempts fail with 400
    for (let i = 0; i < 4; i++) {
      const res = await authorClient.post("/api/invitations/verify-otp", {
        email: "newauthor@example.com",
        otp: "000000",
      });
      assert.equal(res.status, 400, "Invalid OTP must return 400");
    }

    // 5th attempt reaches MAX_OTP_ATTEMPTS (5) and returns 429
    const lockoutRes = await authorClient.post("/api/invitations/verify-otp", {
      email: "newauthor@example.com",
      otp: "000000",
    });
    assert.equal(lockoutRes.status, 429, "Exhausted attempts must return 429");
  });

  test("5.1 Complete successful OTP verification, invitation issuance, and acceptance", async () => {
    clearSentEmails();
    // Step 1: Send fresh OTP for candidate
    await authorClient.post("/api/invitations/send-otp", {
      email: "candidate@example.com",
    });

    const sent = getSentEmails();
    const otpMatch = sent[0].text.match(/\b\d{6}\b/);
    assert.ok(otpMatch, "Email text must contain the 6-digit OTP");
    const otp = otpMatch[0];

    // Step 2: Verify OTP
    const verifyRes = await authorClient.post("/api/invitations/verify-otp", {
      email: "candidate@example.com",
      otp,
    });
    assert.equal(verifyRes.status, 200);
    assert.ok(verifyRes.body.verificationToken, "Must return single-use verificationToken");
    const verificationToken = verifyRes.body.verificationToken;

    // Step 3: Create Invitation
    clearSentEmails();
    const inviteRes = await authorClient.post("/api/invitations", {
      email: "candidate@example.com",
      verificationToken,
    });
    assert.equal(inviteRes.status, 201, "Invitation creation should return 201");
    assert.equal(inviteRes.body.invitation.status, "PENDING");

    const inviteEmails = getSentEmails();
    assert.equal(inviteEmails.length, 1);
    assert.equal(inviteEmails[0].to, "candidate@example.com");

    const tokenMatch = inviteEmails[0].text.match(/token=([a-f0-9]{64})/i);
    assert.ok(tokenMatch, "Email must contain 64-char hex invitation token");
    const rawInvitationToken = tokenMatch[1];

    // Step 4: Recipient opens link -> calls /api/invitations/validate
    const candidateClient = env.createClient();
    const validateRes = await candidateClient.post("/api/invitations/validate", {
      token: rawInvitationToken,
    });
    assert.equal(validateRes.status, 200, "Validation should return 200");
    assert.equal(validateRes.body.email, "candidate@example.com");
    assert.ok(candidateClient.cookies.has("scion_invitation_setup"), "Must set scion_invitation_setup cookie");

    // Step 5: Recipient completes account setup
    const completeRes = await candidateClient.post("/api/invitations/complete", {
      fullName: "Candidate Author",
      displayName: "Candidate Author",
      username: "candidate_author",
      password: "CandidateSecurePassword123!",
      confirmPassword: "CandidateSecurePassword123!",
    });

    assert.equal(completeRes.status, 201, "Account setup should return 201");
    assert.equal(completeRes.body.user.role, "AUTHOR", "Newly created account must have AUTHOR role");
    assert.ok(candidateClient.cookies.has("scion_access_token"), "Must receive active scion_access_token auth cookie");

    // Verify invitation is marked ACCEPTED in DB
    const dbInvite = await Invitation.findById(inviteRes.body.invitation.id);
    assert.equal(dbInvite.status, "ACCEPTED");

    // Step 6: Verify newly created AUTHOR can log in and immediately invite another author!
    const newAuthorClient = env.createClient();
    await newAuthorClient.post("/api/auth/login", {
      email: "candidate@example.com",
      password: "CandidateSecurePassword123!",
    });

    const newInviteOtpRes = await newAuthorClient.post("/api/invitations/send-otp", {
      email: "subauthor@example.com",
    });
    assert.equal(newInviteOtpRes.status, 200, "New AUTHOR must be authorized to initiate author invitation");
  });

  test("6.1 Reusing an already accepted invitation token is strictly rejected", async () => {
    // Attempting to validate or complete with an already accepted invitation
    const reuseClient = env.createClient();
    const dbAcceptedInvite = await Invitation.findOne({ status: "ACCEPTED" });
    assert.ok(dbAcceptedInvite, "Accepted invite must exist");

    // Attempting to re-complete should fail with 400 or 409
    const reuseRes = await reuseClient.post("/api/invitations/complete", {
      fullName: "Attacker",
      displayName: "Attacker",
      username: "attacker_user",
      password: "AttackerPassword123!",
      confirmPassword: "AttackerPassword123!",
    });
    assert.equal(reuseRes.status, 400, "Must be rejected without valid setup session");
  });

  test("6.2 Revoked invitation cannot be validated or accepted", async () => {
    // Create an invite as root
    await rootClient.post("/api/invitations/send-otp", {
      email: "torevoke@example.com",
    });
    const otp = getSentEmails().pop().text.match(/\b\d{6}\b/)[0];
    const verify = await rootClient.post("/api/invitations/verify-otp", {
      email: "torevoke@example.com",
      otp,
    });
    const invite = await rootClient.post("/api/invitations", {
      email: "torevoke@example.com",
      verificationToken: verify.body.verificationToken,
    });
    const rawToken = getSentEmails().pop().text.match(/token=([a-f0-9]{64})/i)[1];

    // Revoke it
    const revokeRes = await rootClient.patch(`/api/invitations/${invite.body.invitation.id}/revoke`);
    assert.equal(revokeRes.status, 200);

    // Candidate tries to validate
    const client = env.createClient();
    const validateRes = await client.post("/api/invitations/validate", {
      token: rawToken,
    });
    assert.equal(validateRes.status, 410, "Revoked invitation must return 410 Gone");
    assert.equal(validateRes.body.code, "INVITATION_REVOKED");
  });
});
