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

  // 3. Generate 6-digit numeric OTP (100000 - 999999) using crypto.randomInt
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = await hashPassword(otp);

  const otpExpiresAt = new Date(Date.now() + OTP_LIFETIME_MS);

  // 3. Upsert email verification record
  await EmailVerification.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        otpHash,
        otpAttempts: 0,
        otpExpiresAt,
        verified: false,
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
        invitedBy: invitedById,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  // 4. Send email via emailService
  await sendOtpEmail({ to: normalizedEmail, otp });

  // Raw OTP is NEVER returned in response
  return {
    success: true,
    message: "OTP sent successfully to the provided email address",
  };
}

/**
 * Step 2: Verifies the 6-digit OTP entered by the inviter.
 * Issues a short-lived verificationToken proving email verification.
 * @param {{ email: string, otp: string }} params
 * @returns {Promise<{ message: string, verificationToken: string }>}
 */
export async function verifyEmailOtp({ email, otp }) {
  const normalizedEmail = email.trim().toLowerCase();

  const record = await EmailVerification.findOne({ email: normalizedEmail }).select(
    "+otpHash"
  );

  if (!record) {
    const error = new Error("NO_OTP_REQUESTED");
    error.statusCode = 404;
    throw error;
  }

  // Check expiration
  if (new Date() > record.otpExpiresAt) {
    const error = new Error("OTP_EXPIRED");
    error.statusCode = 410;
    throw error;
  }

  // Check maximum failed attempts
  if (record.otpAttempts >= MAX_OTP_ATTEMPTS) {
    const error = new Error("MAX_OTP_ATTEMPTS_EXCEEDED");
    error.statusCode = 429;
    throw error;
  }

  // Verify OTP using Argon2id
  const isValid = await verifyPassword(otp.trim(), record.otpHash);
  if (!isValid) {
    record.otpAttempts += 1;
    await record.save();

    if (record.otpAttempts >= MAX_OTP_ATTEMPTS) {
      const error = new Error("MAX_OTP_ATTEMPTS_EXCEEDED");
      error.statusCode = 429;
      throw error;
    }

    const remainingAttempts = MAX_OTP_ATTEMPTS - record.otpAttempts;
    const error = new Error("INVALID_OTP");
    error.statusCode = 400;
    error.remainingAttempts = remainingAttempts;
    throw error;
  }

  // OTP verified successfully: issue verificationToken
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenHash = sha256(verificationToken);

  record.verified = true;
  record.verificationTokenHash = verificationTokenHash;
  record.verificationTokenExpiresAt = new Date(
    Date.now() + VERIFICATION_TOKEN_LIFETIME_MS
  );
  await record.save();

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
  await EmailVerification.deleteOne({ _id: verificationRecord._id });

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
  const invitationUrl = `${frontendUrl}/accept-invitation?token=${invitationToken}`;

  await sendInvitationEmail({
    to: normalizedEmail,
    invitationUrl,
    expiresAt,
  });

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

  invitation.status = "REVOKED";
  invitation.revokedAt = new Date();
  await invitation.save();

  return invitation;
}

/**
 * Validates invitation token from the URL.
 * Generates and returns short-lived setupToken (<= 15 mins, <= expiresAt).
 * Public endpoint.
 * @param {string} rawToken
 * @returns {Promise<{ valid: boolean, email: string, setupToken: string, expiresAt: Date }>}
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

  if (invitation.status === "REVOKED") {
    const error = new Error("INVITATION_REVOKED");
    error.statusCode = 400;
    throw error;
  }

  if (invitation.status === "ACCEPTED") {
    const error = new Error("INVITATION_ALREADY_USED");
    error.statusCode = 400;
    throw error;
  }

  // Server-side check for 2-hour expiration
  if (new Date() > invitation.expiresAt) {
    if (invitation.status !== "EXPIRED") {
      invitation.status = "EXPIRED";
      await invitation.save();
    }
    const error = new Error("INVITATION_EXPIRED");
    error.statusCode = 410;
    throw error;
  }

  if (invitation.status !== "PENDING") {
    const error = new Error("INVITATION_NOT_ACTIVE");
    error.statusCode = 400;
    throw error;
  }

  // Issue short-lived setupToken (<= 15 mins, never exceeding 2-hour expiresAt)
  const setupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = sha256(setupToken);

  const effectiveExpiry = Math.min(
    Date.now() + SETUP_TOKEN_LIFETIME_MS,
    invitation.expiresAt.getTime()
  );
  const setupTokenExpiresAt = new Date(effectiveExpiry);

  invitation.setupTokenHash = setupTokenHash;
  invitation.setupTokenExpiresAt = setupTokenExpiresAt;
  await invitation.save();

  return {
    valid: true,
    email: invitation.email,
    setupToken,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Completes author account creation using setupToken.
 * Accepts username and password.
 * Hardcodes role = "AUTHOR".
 * @param {{ setupToken: string, username: string, password: string }} params
 * @returns {Promise<{ user: { id: string, name: string, username: string, email: string, role: string }, token: string }>}
 */
export async function completeAuthorSetup({ setupToken, username, password }) {
  if (!setupToken) {
    const error = new Error("MISSING_SETUP_TOKEN");
    error.statusCode = 400;
    throw error;
  }

  const normalizedUsername = username.trim().toLowerCase();
  const setupTokenHash = sha256(setupToken.trim());
  const now = new Date();

  // Check username uniqueness
  const existingUsername = await User.findOne({ username: normalizedUsername });
  if (existingUsername) {
    const error = new Error("USERNAME_ALREADY_EXISTS");
    error.statusCode = 409;
    throw error;
  }

  // Route 1: Replica Set MongoDB Transactions
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const invitation = await Invitation.findOneAndUpdate(
        {
          setupTokenHash,
          status: "PENDING",
          setupTokenExpiresAt: { $gt: now },
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: "ACCEPTED",
            usedAt: now,
          },
          $unset: {
            setupTokenHash: 1,
            setupTokenExpiresAt: 1,
          },
        },
        { returnDocument: "after", session }
      );

      if (!invitation) {
        const existing = await Invitation.findOne({ setupTokenHash }).session(session);
        if (existing) {
          if (existing.status === "ACCEPTED") {
            const err = new Error("INVITATION_ALREADY_USED");
            err.statusCode = 409;
            throw err;
          }
          if (existing.expiresAt && existing.expiresAt <= now) {
            const err = new Error("INVITATION_EXPIRED");
            err.statusCode = 410;
            throw err;
          }
          if (existing.setupTokenExpiresAt && existing.setupTokenExpiresAt <= now) {
            const err = new Error("SETUP_TOKEN_EXPIRED");
            err.statusCode = 410;
            throw err;
          }
        }
        const err = new Error("INVALID_OR_EXPIRED_SETUP_TOKEN");
        err.statusCode = 400;
        throw err;
      }

      // Check email collision
      const emailCollision = await User.findOne({ email: invitation.email }).session(session);
      if (emailCollision) {
        const err = new Error("EMAIL_ALREADY_REGISTERED");
        err.statusCode = 409;
        throw err;
      }

      const passwordHash = await hashPassword(password);
      const createdUsers = await User.create(
        [
          {
            name: normalizedUsername,
            username: normalizedUsername,
            email: invitation.email,
            passwordHash,
            role: "AUTHOR",
            isActive: true,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      const user = createdUsers[0];
      const token = generateAccessToken(user);

      return {
        user: {
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        token,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Route 2: Standalone MongoDB Fallback (Two-Phase Reservation with Compensating Rollback)
  const invitation = await Invitation.findOneAndUpdate(
    {
      setupTokenHash,
      $or: [
        { status: "PENDING" },
        {
          status: "PROCESSING",
          processingLockedAt: { $lt: new Date(Date.now() - PROCESSING_LOCK_TIMEOUT_MS) },
        },
      ],
      setupTokenExpiresAt: { $gt: now },
      expiresAt: { $gt: now },
    },
    {
      $set: {
        status: "PROCESSING",
        processingLockedAt: now,
      },
    },
    { returnDocument: "after" }
  );

  if (!invitation) {
    const existing = await Invitation.findOne({ setupTokenHash });
    if (existing) {
      if (existing.status === "ACCEPTED") {
        const err = new Error("INVITATION_ALREADY_USED");
        err.statusCode = 409;
        throw err;
      }
      if (existing.expiresAt && existing.expiresAt <= now) {
        const err = new Error("INVITATION_EXPIRED");
        err.statusCode = 410;
        throw err;
      }
      if (existing.setupTokenExpiresAt && existing.setupTokenExpiresAt <= now) {
        const err = new Error("SETUP_TOKEN_EXPIRED");
        err.statusCode = 410;
        throw err;
      }
    }
    const err = new Error("INVALID_OR_EXPIRED_SETUP_TOKEN");
    err.statusCode = 400;
    throw err;
  }

  let createdUser;
  try {
    // Check email collision
    const emailCollision = await User.findOne({ email: invitation.email });
    if (emailCollision) {
      const err = new Error("EMAIL_ALREADY_REGISTERED");
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await hashPassword(password);
    createdUser = await User.create({
      name: normalizedUsername,
      username: normalizedUsername,
      email: invitation.email,
      passwordHash,
      role: "AUTHOR",
      isActive: true,
    });
  } catch (err) {
    // Compensating rollback: restore status back to PENDING so user can retry
    await Invitation.findByIdAndUpdate(invitation._id, {
      $set: { status: "PENDING" },
      $unset: { processingLockedAt: 1 },
    });
    throw err;
  }

  // Finalize acceptance
  await Invitation.findByIdAndUpdate(invitation._id, {
    $set: {
      status: "ACCEPTED",
      usedAt: new Date(),
    },
    $unset: {
      setupTokenHash: 1,
      setupTokenExpiresAt: 1,
      processingLockedAt: 1,
    },
  });

  const token = generateAccessToken(createdUser);

  return {
    user: {
      id: createdUser._id.toString(),
      name: createdUser.name,
      username: createdUser.username,
      email: createdUser.email,
      role: createdUser.role,
    },
    token,
  };
}
