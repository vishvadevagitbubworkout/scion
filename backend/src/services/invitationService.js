import crypto from "crypto";
import mongoose from "mongoose";
import Invitation from "../models/Invitation.js";
import User from "../models/User.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateAccessToken } from "../utils/jwt.js";

const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1000; // 3 days / 72 hours
const SETUP_TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes
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
 * Creates a new Author Invitation.
 * Only callable by ROOT.
 * @param {{ email: string, invitedById: string }} params
 * @returns {Promise<{ invitation: Document, invitationToken: string, otp: string }>}
 */
export async function createInvitation({ email, invitedById }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check if email already belongs to a registered User
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error("EMAIL_ALREADY_REGISTERED");
    error.statusCode = 409;
    throw error;
  }

  // 2. Check if an active PENDING invitation already exists for this email
  const existingInvitation = await Invitation.findOne({
    email: normalizedEmail,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  });

  if (existingInvitation) {
    const error = new Error("ACTIVE_INVITATION_EXISTS");
    error.statusCode = 409;
    throw error;
  }

  // 3. Generate cryptographically secure 64-char hex invitation token
  const invitationToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(invitationToken);

  // 4. Generate cryptographically secure 6-digit numeric OTP (100000 - 999999)
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = await hashPassword(otp);

  // 5. Expiration: strictly 3 days (72 hours)
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

  // 6. Create Invitation document
  const invitation = await Invitation.create({
    email: normalizedEmail,
    role: "AUTHOR",
    tokenHash,
    otpHash,
    otpAttempts: 0,
    status: "PENDING",
    invitedBy: invitedById,
    expiresAt,
  });

  return {
    invitation,
    invitationToken,
    otp,
  };
}

/**
 * Returns all invitations for ROOT oversight.
 * @returns {Promise<Document[]>}
 */
export async function getAllInvitations() {
  return Invitation.find()
    .populate("invitedBy", "name email")
    .sort({ createdAt: -1 });
}

/**
 * Revokes a pending invitation.
 * Only callable by ROOT.
 * @param {{ invitationId: string, rootUserId: string }} params
 * @returns {Promise<Document>}
 */
export async function revokeInvitation({ invitationId, rootUserId }) {
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
 * Validates an invitation token from the URL.
 * Public endpoint. Does not return OTP, hashes, or setup tokens.
 * @param {string} rawToken
 * @returns {Promise<{ valid: boolean, email: string, expiresAt: Date }>}
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

  // Check 3-day server-side expiration
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

  return {
    valid: true,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Verifies the 6-digit OTP for an invitation.
 * On success, generates a short-lived setupToken (max 15 mins).
 * Public endpoint.
 * @param {{ token: string, otp: string }} params
 * @returns {Promise<{ message: string, setupToken: string, expiresIn: number }>}
 */
export async function verifyInvitationOtp({ token, otp }) {
  if (!token || !otp) {
    const error = new Error("MISSING_CREDENTIALS");
    error.statusCode = 400;
    throw error;
  }

  const tokenHash = sha256(token.trim());
  const invitation = await Invitation.findOne({ tokenHash }).select("+otpHash");

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

  // Check maximum failed OTP attempts
  if (invitation.otpAttempts >= MAX_OTP_ATTEMPTS) {
    if (invitation.status !== "REVOKED") {
      invitation.status = "REVOKED";
      await invitation.save();
    }
    const error = new Error("MAX_OTP_ATTEMPTS_EXCEEDED");
    error.statusCode = 429;
    throw error;
  }

  // Verify OTP using Argon2
  const isValidOtp = await verifyPassword(otp.trim(), invitation.otpHash);
  if (!isValidOtp) {
    invitation.otpAttempts += 1;
    const remainingAttempts = Math.max(0, MAX_OTP_ATTEMPTS - invitation.otpAttempts);

    if (invitation.otpAttempts >= MAX_OTP_ATTEMPTS) {
      invitation.status = "REVOKED";
      await invitation.save();
      const error = new Error("MAX_OTP_ATTEMPTS_EXCEEDED");
      error.statusCode = 429;
      throw error;
    }

    await invitation.save();
    const error = new Error(`INVALID_OTP`);
    error.statusCode = 400;
    error.remainingAttempts = remainingAttempts;
    throw error;
  }

  // Generate 64-char hex setupToken
  const setupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = sha256(setupToken);

  // setupToken lifetime: 15 minutes, never exceeding master invitation expiresAt
  const effectiveExpiry = Math.min(
    Date.now() + SETUP_TOKEN_LIFETIME_MS,
    invitation.expiresAt.getTime()
  );
  const setupTokenExpiresAt = new Date(effectiveExpiry);

  invitation.setupTokenHash = setupTokenHash;
  invitation.setupTokenExpiresAt = setupTokenExpiresAt;
  await invitation.save();

  return {
    message: "OTP verified successfully",
    setupToken,
    expiresIn: Math.floor((effectiveExpiry - Date.now()) / 1000),
  };
}

/**
 * Completes author account setup using the short-lived setupToken.
 * Guarantees consistency between User creation and Invitation consumption.
 * @param {{ setupToken: string, name: string, password: string }} params
 * @returns {Promise<{ user: { id: string, name: string, email: string, role: string }, token: string }>}
 */
export async function completeAuthorSetup({ setupToken, name, password }) {
  if (!setupToken) {
    const error = new Error("MISSING_SETUP_TOKEN");
    error.statusCode = 400;
    throw error;
  }

  const setupTokenHash = sha256(setupToken.trim());
  const now = new Date();

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
            otpHash: 1,
          },
        },
        { returnDocument: "after", session }
      );

      if (!invitation) {
        // Find reason for informative error
        const existing = await Invitation.findOne({ setupTokenHash }).session(session);
        if (existing) {
          if (existing.status === "ACCEPTED") {
            const err = new Error("INVITATION_ALREADY_USED");
            err.statusCode = 409;
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

      // Check if email was registered in the meantime
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
            name: name.trim(),
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
  // 1. Atomically reserve invitation by setting status = "PROCESSING"
  const invitation = await Invitation.findOneAndUpdate(
    {
      setupTokenHash,
      $or: [
        { status: "PENDING" },
        // Self-healing: if server crashed during processing > 30s ago, allow retry
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
    // 2. Pre-check email collision
    const emailCollision = await User.findOne({ email: invitation.email });
    if (emailCollision) {
      const err = new Error("EMAIL_ALREADY_REGISTERED");
      err.statusCode = 409;
      throw err;
    }

    // 3. Create AUTHOR user with Argon2 password
    const passwordHash = await hashPassword(password);
    createdUser = await User.create({
      name: name.trim(),
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

  // 4. Finalize invitation acceptance
  await Invitation.findByIdAndUpdate(invitation._id, {
    $set: {
      status: "ACCEPTED",
      usedAt: new Date(),
    },
    $unset: {
      setupTokenHash: 1,
      setupTokenExpiresAt: 1,
      otpHash: 1,
      processingLockedAt: 1,
    },
  });

  const token = generateAccessToken(createdUser);

  return {
    user: {
      id: createdUser._id.toString(),
      name: createdUser.name,
      email: createdUser.email,
      role: createdUser.role,
    },
    token,
  };
}
