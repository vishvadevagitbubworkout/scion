import crypto from "crypto";
import mongoose from "mongoose";
import Invitation from "../models/Invitation.js";
import EmailVerification from "../models/EmailVerification.js";
import User from "../models/User.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateAccessToken } from "../utils/jwt.js";
import { sendOtpEmail, sendInvitationEmail } from "./emailService.js";

// FINAL REQUIREMENT: EXACTLY 2 HOURS EXPIRY FOR INVITATIONS
const INVITATION_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours
const OTP_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes
const SETUP_TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes
const VERIFICATION_TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes
const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_OTP_SENDS_PER_WINDOW = 5;
const PROCESSING_LOCK_TIMEOUT_MS = 30 * 1000; // 30 seconds

/**
 * Calculates SHA-256 hash of a string.
 * @param {string} val
 * @returns {string}
 */
function sha256(val) {
  return crypto.createHash("sha256").update(val).digest("hex");
}

/**
 * Checks whether the current MongoDB connection supports multi-document transactions.
 * Transactions require a replica set or sharded cluster topology.
 * @returns {boolean}
 */
function supportsTransactions() {
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  return topologyType === "ReplicaSetWithPrimary" || topologyType === "Sharded";
}

/**
 * Step 1: Generates OTP and sends it to invitee's email.
 * Called by ROOT or AUTHOR.
 * @param {{ email: string, invitedById: string }} params
 * @returns {Promise<{ message: string }>}
 */
export async function sendVerificationOtp({ email, invitedById }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check if email already belongs to a registered User
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error("EMAIL_ALREADY_REGISTERED");
    error.statusCode = 409;
    throw error;
  }

  // 2. Check if active PENDING invitation already exists
  const existingPending = await Invitation.findOne({
    email: normalizedEmail,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  });

  if (existingPending) {
    const error = new Error("ACTIVE_INVITATION_EXISTS");
    error.statusCode = 409;
    throw error;
  }

  const now = new Date();
  const verification = await EmailVerification.findOne({ email: normalizedEmail })
    .select("sendAttempts sendWindowStartedAt lastSentAt updatedAt");
  const attemptsInWindow = verification?.sendAttempts ?? 0;

  if (verification?.lastSentAt) {
    const cooldownRemaining = OTP_RESEND_COOLDOWN_MS
      - (now.getTime() - verification.lastSentAt.getTime());
    if (cooldownRemaining > 0) {
      const error = new Error("OTP_RESEND_COOLDOWN");
      error.statusCode = 429;
      error.retryAfterSeconds = Math.ceil(cooldownRemaining / 1000);
      throw error;
    }
  }

  const sendWindowExpired = !verification?.sendWindowStartedAt
    || now.getTime() - verification.sendWindowStartedAt.getTime() >= OTP_SEND_WINDOW_MS;
  if (verification && !sendWindowExpired
    && attemptsInWindow >= MAX_OTP_SENDS_PER_WINDOW) {
    const error = new Error("OTP_SEND_LIMIT_EXCEEDED");
    error.statusCode = 429;
    error.retryAfterSeconds = Math.ceil(
      (verification.sendWindowStartedAt.getTime() + OTP_SEND_WINDOW_MS - now.getTime()) / 1000
    );
    throw error;
  }

  // Generate a cryptographically random six-digit OTP.
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = await hashPassword(otp);
  const sendState = {
    otpHash,
    otpAttempts: 0,
    otpExpiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
    verified: false,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    invitedBy: invitedById,
    lastSentAt: now,
    sendWindowStartedAt: sendWindowExpired ? now : verification?.sendWindowStartedAt,
    sendAttempts: sendWindowExpired ? 1 : attemptsInWindow + 1,
  };

  if (verification) {
    const updated = await EmailVerification.findOneAndUpdate(
      {
        _id: verification._id,
        updatedAt: verification.updatedAt,
      },
      { $set: sendState },
      { returnDocument: "after" }
    );
    if (!updated) {
      const error = new Error("OTP_SEND_RACE");
      error.statusCode = 429;
      error.retryAfterSeconds = Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000);
      throw error;
    }
  } else {
    try {
      await EmailVerification.create({ email: normalizedEmail, ...sendState });
    } catch (error) {
      if (error.code === 11000) {
        const rateLimitError = new Error("OTP_SEND_RACE");
        rateLimitError.statusCode = 429;
        rateLimitError.retryAfterSeconds = Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000);
        throw rateLimitError;
      }
      throw error;
    }
  }

  try {
    await sendOtpEmail({ to: normalizedEmail, otp });
  } catch {
    throw new Error("Verification email could not be accepted by the provider");
  }

  return {
    success: true,
    message: "Verification email accepted by the email provider",
  };
}

/**
 * Step 2: Verifies the 6-digit OTP entered by the inviter.
 * Issues a short-lived verificationToken proving email verification.
 * @param {{ email: string, otp: string }} params
 * @returns {Promise<{ message: string, verificationToken: string }>}
 */
export async function verifyEmailOtp({ email, otp, invitedById }) {
  const normalizedEmail = email.trim().toLowerCase();

  const record = await EmailVerification.findOne({
    email: normalizedEmail,
    invitedBy: invitedById,
    verified: false,
    otpExpiresAt: { $gt: new Date() },
    otpAttempts: { $lt: MAX_OTP_ATTEMPTS },
  }).select("+otpHash");

  if (!record) {
    const expired = await EmailVerification.exists({
      email: normalizedEmail,
      invitedBy: invitedById,
      otpExpiresAt: { $lte: new Date() },
    });
    const error = new Error(expired ? "OTP_EXPIRED" : "NO_OTP_REQUESTED");
    error.statusCode = expired ? 410 : 404;
    throw error;
  }

  const isValid = await verifyPassword(otp.trim(), record.otpHash);
  if (!isValid) {
    const failedAttempt = await EmailVerification.findOneAndUpdate(
      { _id: record._id, otpAttempts: { $lt: MAX_OTP_ATTEMPTS }, verified: false },
      { $inc: { otpAttempts: 1 } },
      { returnDocument: "after" }
    );
    if (!failedAttempt || failedAttempt.otpAttempts >= MAX_OTP_ATTEMPTS) {
      const error = new Error("MAX_OTP_ATTEMPTS_EXCEEDED");
      error.statusCode = 429;
      throw error;
    }

    const remainingAttempts = MAX_OTP_ATTEMPTS - failedAttempt.otpAttempts;
    const error = new Error("INVALID_OTP");
    error.statusCode = 400;
    error.remainingAttempts = remainingAttempts;
    throw error;
  }

  // OTP verified successfully: issue verificationToken
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenHash = sha256(verificationToken);

  const claimed = await EmailVerification.findOneAndUpdate(
    {
      _id: record._id,
      otpHash: record.otpHash,
      invitedBy: invitedById,
      verified: false,
      otpAttempts: { $lt: MAX_OTP_ATTEMPTS },
      otpExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        verified: true,
        verificationTokenHash,
        verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_LIFETIME_MS),
      },
      $unset: { otpHash: 1 },
    },
    { returnDocument: "after" }
  );
  if (!claimed) {
    const error = new Error("NO_OTP_REQUESTED");
    error.statusCode = 404;
    throw error;
  }

  return {
    success: true,
    message: "Email verified successfully",
    verificationToken,
  };
}

/**
 * Step 3: Creates secure invitation after email verification.
 * Requires verified email and valid verificationToken.
 * Sets expiry to EXACTLY 2 HOURS.
 * Sends invitation URL to invitee email.
 * Called by ROOT or AUTHOR.
 * @param {{ email: string, verificationToken: string, invitedById: string }} params
 * @returns {Promise<{ invitation: Document }>}
 */
export async function createInvitation({
  email,
  verificationToken,
  invitedById,
  sendEmail = sendInvitationEmail,
}) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check if email already belongs to a registered User
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error("EMAIL_ALREADY_REGISTERED");
    error.statusCode = 409;
    throw error;
  }

  // 2. Verify server-side email verification state
  const verificationTokenHash = sha256(verificationToken.trim());
  const verificationRecord = await EmailVerification.findOne({
    email: normalizedEmail,
    verificationTokenHash,
    invitedBy: invitedById,
    verified: true,
    verificationTokenExpiresAt: { $gt: new Date() },
  });

  if (!verificationRecord) {
    const error = new Error("EMAIL_NOT_VERIFIED");
    error.statusCode = 400;
    throw error;
  }

  // 3. Check if active PENDING invitation already exists
  const existingPending = await Invitation.findOne({
    email: normalizedEmail,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  });

  if (existingPending) {
    const error = new Error("ACTIVE_INVITATION_EXISTS");
    error.statusCode = 409;
    throw error;
  }

  // 4. Consume the verification record (one-time use)
  const consumedRecord = await EmailVerification.findOneAndDelete({
    _id: verificationRecord._id,
    email: normalizedEmail,
    invitedBy: invitedById,
    verificationTokenHash,
    verified: true,
    verificationTokenExpiresAt: { $gt: new Date() },
  });
  if (!consumedRecord) {
    const error = new Error("EMAIL_NOT_VERIFIED");
    error.statusCode = 400;
    throw error;
  }

  // 5. Generate secure 64-char hex invitation token
  const invitationToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(invitationToken);

  // 6. Enforce EXACTLY 2 HOURS expiration
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

  // 7. Create Invitation document (role hardcoded to AUTHOR)
  const invitation = await Invitation.create({
    email: normalizedEmail,
    role: "AUTHOR",
    tokenHash,
    status: "PENDING",
    invitedBy: invitedById,
    expiresAt,
  });

  // 8. Construct invitation URL and send email
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const invitationUrl = new URL("/accept-invitation", frontendUrl);
  invitationUrl.hash = new URLSearchParams({ token: invitationToken }).toString();

  try {
    await sendEmail({
      to: normalizedEmail,
      invitationUrl: invitationUrl.href,
      expiresAt,
    });
  } catch (deliveryError) {
    try {
      await Invitation.findOneAndUpdate(
        { _id: invitation._id, status: "PENDING" },
        { $set: { status: "REVOKED", revokedAt: new Date() } }
      );
    } catch (recoveryError) {
      throw new Error("Invitation delivery failed and invalidation could not be confirmed", {
        cause: recoveryError,
      });
    }
    throw new Error("Invitation email delivery failed", { cause: deliveryError });
  }

  // Raw token is NEVER returned in response
  return {
    invitation,
  };
}

/**
 * Returns invitations based on caller role.
 * ROOT sees all; AUTHOR sees their own.
 * @param {{ userId: string, userRole: string }} params
 * @returns {Promise<Document[]>}
 */
export async function getAllInvitations({ userId, userRole }) {
  const query = userRole === "ROOT" ? {} : { invitedBy: userId };
  return Invitation.find(query)
    .populate("invitedBy", "name email role")
    .sort({ createdAt: -1 });
}

/**
 * Revokes a pending invitation.
 * ROOT can revoke any; AUTHOR can revoke invitations they created.
 * @param {{ invitationId: string, userId: string, userRole: string }} params
 * @returns {Promise<Document>}
 */
export async function revokeInvitation({ invitationId, userId, userRole }) {
  if (!mongoose.Types.ObjectId.isValid(invitationId)) {
    const error = new Error("INVALID_INVITATION_ID");
    error.statusCode = 400;
    throw error;
  }

  const invitation = await Invitation.findById(invitationId);
  if (!invitation) {
    const error = new Error("INVITATION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (userRole !== "ROOT" && invitation.invitedBy.toString() !== userId) {
    const error = new Error("FORBIDDEN_REVOKE");
    error.statusCode = 403;
    throw error;
  }

  if (invitation.status !== "PENDING") {
    const error = new Error("CANNOT_REVOKE_NON_PENDING");
    error.statusCode = 400;
    throw error;
  }

  const revoked = await Invitation.findOneAndUpdate(
    { _id: invitationId, status: "PENDING" },
    { $set: { status: "REVOKED", revokedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!revoked) {
    const error = new Error("CANNOT_REVOKE_NON_PENDING");
    error.statusCode = 400;
    throw error;
  }

  return revoked;
}

/**
 * Validates invitation token from the URL.
 * Generates short-lived setup authorization (<= 15 mins, <= expiresAt).
 * Public endpoint.
 * @param {string} rawToken
 * @returns {Promise<{ valid: boolean, email: string, setupToken: string, expiresAt: Date, setupTokenExpiresAt: Date }>}
 */
export async function validateInvitationToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    const error = new Error("INVALID_TOKEN");
    error.statusCode = 400;
    throw error;
  }

  const tokenHash = sha256(rawToken.trim());
  const invitation = await Invitation.findOne({ tokenHash });

  if (!invitation) {
    const error = new Error("INVITATION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  const now = new Date();
  if (invitation.status === "REVOKED") {
    const error = new Error("INVITATION_REVOKED");
    error.statusCode = 410;
    throw error;
  }

  if (invitation.status === "ACCEPTED") {
    const error = new Error("INVITATION_ALREADY_USED");
    error.statusCode = 409;
    throw error;
  }

  if (invitation.expiresAt <= now || invitation.status === "EXPIRED") {
    await Invitation.updateOne(
      {
        _id: invitation._id,
        status: { $in: ["PENDING", "PROCESSING"] },
        expiresAt: { $lte: now },
      },
      {
        $set: { status: "EXPIRED" },
        $unset: { processingLockedAt: 1, processingLockId: 1 },
      }
    );
    const error = new Error("INVITATION_EXPIRED");
    error.statusCode = 410;
    throw error;
  }

  if (invitation.status !== "PENDING") {
    const error = new Error("INVITATION_PROCESSING");
    error.statusCode = 409;
    throw error;
  }

  const inviter = await User.findOne({
    _id: invitation.invitedBy,
    isActive: true,
    role: { $in: ["ROOT", "AUTHOR"] },
  }).select("_id");
  if (!inviter) {
    const error = new Error("INVITER_UNAVAILABLE");
    error.statusCode = 410;
    throw error;
  }

  // Validation issues a short-lived form token but never consumes the invitation.
  const setupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = sha256(setupToken);

  const effectiveExpiry = Math.min(
    now.getTime() + SETUP_TOKEN_LIFETIME_MS,
    invitation.expiresAt.getTime()
  );
  const setupTokenExpiresAt = new Date(effectiveExpiry);

  const updated = await Invitation.findOneAndUpdate(
    {
      _id: invitation._id,
      tokenHash,
      status: "PENDING",
      expiresAt: { $gt: now },
    },
    { $set: { setupTokenHash, setupTokenExpiresAt } },
    { returnDocument: "after" }
  );
  if (!updated) {
    const current = await Invitation.findById(invitation._id);
    if (current?.status === "REVOKED") {
      const error = new Error("INVITATION_REVOKED");
      error.statusCode = 410;
      throw error;
    }
    if (current?.status === "ACCEPTED") {
      const error = new Error("INVITATION_ALREADY_USED");
      error.statusCode = 409;
      throw error;
    }
    if (!current || current.expiresAt <= new Date()) {
      const error = new Error("INVITATION_EXPIRED");
      error.statusCode = 410;
      throw error;
    }
    const error = new Error("INVITATION_PROCESSING");
    error.statusCode = 409;
    throw error;
  }

  return {
    valid: true,
    email: updated.email,
    setupToken,
    expiresAt: updated.expiresAt,
    setupTokenExpiresAt,
  };
}

function throwSetupError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

async function throwInvitationStateError(invitation, now) {
  if (invitation.status === "REVOKED") {
    throwSetupError("INVITATION_REVOKED", 410);
  }
  if (invitation.status === "ACCEPTED") {
    throwSetupError("INVITATION_ALREADY_USED", 409);
  }
  if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) {
    await Invitation.updateOne(
      { _id: invitation._id, status: "PENDING", expiresAt: { $lte: now } },
      { $set: { status: "EXPIRED" } }
    );
    throwSetupError("INVITATION_EXPIRED", 410);
  }
  if (invitation.setupTokenExpiresAt && invitation.setupTokenExpiresAt <= now) {
    throwSetupError("SETUP_TOKEN_EXPIRED", 410);
  }
  if (invitation.status === "PROCESSING") {
    throwSetupError("INVITATION_PROCESSING", 409);
  }
  throwSetupError("INVALID_OR_EXPIRED_SETUP_TOKEN", 400);
}

function serializeAuthor(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    displayName: user.displayName,
    bio: user.bio,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}

function createSetupSession(user) {
  return {
    user: serializeAuthor(user),
    token: generateAccessToken(user),
  };
}

function throwAccountDuplicateError(error) {
  if (error?.code !== 11000) throw error;
  const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0];
  if (duplicateField === "username") {
    throwSetupError("USERNAME_ALREADY_EXISTS", 409);
  }
  if (duplicateField === "email") {
    throwSetupError("EMAIL_ALREADY_REGISTERED", 409);
  }
  if (duplicateField === "acceptedInvitationId") {
    throwSetupError("INVITATION_ALREADY_USED", 409);
  }
  throw error;
}

async function ensureInvitationInviter(invitation) {
  const inviter = await User.findOne({
    _id: invitation.invitedBy,
    isActive: true,
    role: { $in: ["ROOT", "AUTHOR"] },
  }).select("_id");
  if (!inviter) {
    throwSetupError("INVITER_UNAVAILABLE", 410);
  }
}

async function finishStandaloneAcceptance(invitationId, lockId, user) {
  const finished = await Invitation.findOneAndUpdate(
    {
      _id: invitationId,
      status: "PROCESSING",
      processingLockId: lockId,
    },
    {
      $set: { status: "ACCEPTED", usedAt: new Date() },
      $unset: {
        processingLockedAt: 1,
        processingLockId: 1,
        setupTokenHash: 1,
        setupTokenExpiresAt: 1,
      },
    },
    { returnDocument: "after" }
  );
  if (finished) return createSetupSession(user);

  const current = await Invitation.findById(invitationId);
  if (current?.status === "ACCEPTED") return createSetupSession(user);
  throwSetupError("INVITATION_PROCESSING", 409);
}

/**
 * Creates the AUTHOR profile only from the server-bound invitation email.
 * MongoDB transactions provide atomicity on replica sets; standalone MongoDB
 * uses an invitation lease plus a unique acceptedInvitationId on User so an
 * interrupted or concurrent request can never create a second account.
 */
export async function completeAuthorSetup({
  setupToken,
  fullName,
  displayName,
  username,
  password,
  bio = "",
}) {
  if (!setupToken || typeof setupToken !== "string") {
    throwSetupError("MISSING_SETUP_TOKEN", 400);
  }

  const normalizedUsername = username.trim().toLowerCase();
  const setupTokenHash = sha256(setupToken.trim());
  const now = new Date();
  const candidate = await Invitation.findOne({ setupTokenHash })
    .select("+processingLockId");
  if (!candidate) throwSetupError("INVALID_OR_EXPIRED_SETUP_TOKEN", 400);
  if (candidate.status !== "PENDING"
    && !(candidate.status === "PROCESSING"
      && candidate.processingLockedAt
      && candidate.processingLockedAt.getTime() < now.getTime() - PROCESSING_LOCK_TIMEOUT_MS)) {
    await throwInvitationStateError(candidate, now);
  }
  if (candidate.expiresAt <= now) {
    await throwInvitationStateError(candidate, now);
  }

  await ensureInvitationInviter(candidate);

  const existingLinkedUser = await User.findOne({
    acceptedInvitationId: candidate._id,
  }).select("+acceptedInvitationId");
  if (existingLinkedUser) {
    if (candidate.expiresAt <= new Date()) {
      const error = new Error("INVITATION_EXPIRED");
      error.statusCode = 410;
      error.invitationId = candidate._id;
      throw error;
    }
    const recoveryLockId = crypto.randomUUID();
    const recoveryAt = new Date();
    const recovery = await Invitation.findOneAndUpdate(
      {
        _id: candidate._id,
        $or: [
          { status: "PENDING" },
          {
            status: "PROCESSING",
            processingLockedAt: { $lt: new Date(recoveryAt.getTime() - PROCESSING_LOCK_TIMEOUT_MS) },
          },
        ],
        setupTokenHash,
        expiresAt: { $gt: recoveryAt },
      },
      {
        $set: {
          status: "PROCESSING",
          processingLockedAt: recoveryAt,
          processingLockId: recoveryLockId,
        },
      },
      { returnDocument: "after" }
    );
    if (!recovery) {
      await Invitation.updateOne(
        { _id: candidate._id, status: "PENDING", expiresAt: { $lte: new Date() } },
        { $set: { status: "EXPIRED" } }
      );
      const current = await Invitation.findById(candidate._id);
      if (current) await throwInvitationStateError(current, new Date());
      throwSetupError("INVALID_OR_EXPIRED_SETUP_TOKEN", 400);
    }
    return finishStandaloneAcceptance(candidate._id, recoveryLockId, existingLinkedUser);
  }

  if (!candidate.setupTokenExpiresAt || candidate.setupTokenExpiresAt <= new Date()) {
    throwSetupError("SETUP_TOKEN_EXPIRED", 410);
  }

  const existingUsername = await User.findOne({ username: normalizedUsername }).select("_id");
  if (existingUsername) throwSetupError("USERNAME_ALREADY_EXISTS", 409);

  const existingEmail = await User.findOne({ email: candidate.email }).select("_id");
  if (existingEmail) throwSetupError("EMAIL_ALREADY_REGISTERED", 409);

  const inviter = await User.findOne({
    _id: candidate.invitedBy,
    isActive: true,
    role: { $in: ["ROOT", "AUTHOR"] },
  }).select("_id");
  if (!inviter) throwSetupError("INVITER_UNAVAILABLE", 410);

  const passwordHash = await hashPassword(password);
  const accountFields = {
    name: fullName.trim(),
    displayName: displayName.trim(),
    bio: bio.trim(),
    username: normalizedUsername,
    email: candidate.email,
    passwordHash,
    role: "AUTHOR",
    isActive: true,
    acceptedInvitationId: candidate._id,
  };

  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const accepted = await Invitation.findOneAndUpdate(
        {
          _id: candidate._id,
          setupTokenHash,
          status: "PENDING",
          setupTokenExpiresAt: { $gt: new Date() },
          expiresAt: { $gt: new Date() },
        },
        {
          $set: { status: "ACCEPTED", usedAt: new Date() },
          $unset: { setupTokenHash: 1, setupTokenExpiresAt: 1 },
        },
        { returnDocument: "after", session }
      );
      if (!accepted) {
        const current = await Invitation.findById(candidate._id).session(session);
        if (current) await throwInvitationStateError(current, new Date());
        throwSetupError("INVALID_OR_EXPIRED_SETUP_TOKEN", 400);
      }

      const [user] = await User.create([accountFields], { session });
      await session.commitTransaction();
      return createSetupSession(user);
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      throwAccountDuplicateError(error);
    } finally {
      await session.endSession();
    }
  }

  const lockId = crypto.randomUUID();
  const lockTime = new Date();
  const invitation = await Invitation.findOneAndUpdate(
    {
      _id: candidate._id,
      setupTokenHash,
      $or: [
        { status: "PENDING" },
        {
          status: "PROCESSING",
          processingLockedAt: { $lt: new Date(lockTime.getTime() - PROCESSING_LOCK_TIMEOUT_MS) },
        },
      ],
      setupTokenExpiresAt: { $gt: lockTime },
      expiresAt: { $gt: lockTime },
    },
    {
      $set: {
        status: "PROCESSING",
        processingLockedAt: lockTime,
        processingLockId: lockId,
      },
    },
    { returnDocument: "after" }
  );
  if (!invitation) {
    const current = await Invitation.findById(candidate._id);
    if (current) await throwInvitationStateError(current, new Date());
    throwSetupError("INVALID_OR_EXPIRED_SETUP_TOKEN", 400);
  }

  try {
    let user = await User.findOne({ acceptedInvitationId: invitation._id })
      .select("+acceptedInvitationId");
    if (!user) {
      const stillValid = await Invitation.exists({
        _id: invitation._id,
        status: "PROCESSING",
        processingLockId: lockId,
        expiresAt: { $gt: new Date() },
        setupTokenExpiresAt: { $gt: new Date() },
      });
      if (!stillValid) {
        const current = await Invitation.findById(invitation._id);
        if (current) await throwInvitationStateError(current, new Date());
        throwSetupError("INVITATION_PROCESSING", 409);
      }

      try {
        user = await User.create(accountFields);
      } catch (error) {
        if (error.code === 11000) {
          user = await User.findOne({ acceptedInvitationId: invitation._id })
            .select("+acceptedInvitationId");
          if (!user) {
            const key = Object.keys(error.keyPattern || {})[0];
            if (key === "username") throwSetupError("USERNAME_ALREADY_EXISTS", 409);
            if (key === "email") throwSetupError("EMAIL_ALREADY_REGISTERED", 409);
          }
        }
        if (!user) throw error;
      }
    }
    return await finishStandaloneAcceptance(invitation._id, lockId, user);
  } catch (error) {
    if (error.invitationId) {
      await User.deleteOne({
        acceptedInvitationId: error.invitationId,
        role: "AUTHOR",
      });
      await Invitation.updateOne(
        { _id: error.invitationId, status: "PENDING" },
        { $set: { status: "EXPIRED" } }
      );
    } else {
      await Invitation.updateOne(
        { _id: invitation._id, status: "PROCESSING", processingLockId: lockId },
        {
          $set: { status: "PENDING" },
          $unset: { processingLockedAt: 1, processingLockId: 1 },
        }
      );
    }
    throw error;
  }
}
