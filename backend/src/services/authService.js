import crypto from "node:crypto";
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateAccessToken } from "../utils/jwt.js";
import { sendPasswordResetEmail } from "./emailService.js";

const PASSWORD_RESET_LIFETIME_MS = 30 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Registers a new public user. Role is ALWAYS hardcoded to VIEWER.
 * @param {{ name: string, email: string, password: string }} data
 * @returns {Promise<{ id: string, name: string, email: string, role: string, isActive: boolean, createdAt: Date }>}
 */
export async function registerUser({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error("EMAIL_ALREADY_EXISTS");
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await hashPassword(password);

  // Security Rule: Public registration explicitly sets VIEWER role
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: "VIEWER",
    isActive: true,
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

/**
 * Authenticates user credentials and generates an access token.
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ user: { id: string, name: string, email: string, role: string }, token: string }>}
 */
export async function loginUser({ email, identifier, password }) {
  const loginHandle = (identifier || email || "").trim().toLowerCase();

  if (!loginHandle) {
    const error = new Error("INVALID_CREDENTIALS");
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findOne({
    $or: [{ email: loginHandle }, { username: loginHandle }],
  }).select("+passwordHash +isActive");

  if (!user) {
    const error = new Error("INVALID_CREDENTIALS");
    error.statusCode = 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error("ACCOUNT_INACTIVE");
    error.statusCode = 401;
    throw error;
  }

  const isValidPassword = await verifyPassword(password, user.passwordHash);
  if (!isValidPassword) {
    const error = new Error("INVALID_CREDENTIALS");
    error.statusCode = 401;
    throw error;
  }

  const token = generateAccessToken(user);

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    token,
  };
}

/**
 * Fetches user by ID, ensuring user exists and is active.
 * @param {string} userId
 * @returns {Promise<{ id: string, name: string, email: string, role: string, isActive: boolean } | null>}
 */
export async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    return null;
  }

  return {
    id: user._id.toString(),
    name: user.name,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}

export async function requestPasswordReset({ email, sendEmail = sendPasswordResetEmail }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail, isActive: true });
  if (!user) return;

  const now = new Date();
  const existing = await PasswordReset.findOne({ userId: user._id });
  if (existing?.lastSentAt
    && now.getTime() - existing.lastSentAt.getTime() < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_LIFETIME_MS);
  const resetUrl = new URL("/reset-password", process.env.FRONTEND_URL || "http://localhost:5173");
  resetUrl.hash = new URLSearchParams({ token }).toString();

  if (existing) {
    const saved = await PasswordReset.findOneAndUpdate(
      { _id: existing._id, lastSentAt: existing.lastSentAt },
      { $set: { tokenHash: hashResetToken(token), expiresAt, usedAt: null, lastSentAt: now } },
      { returnDocument: "after" }
    );
    if (!saved) return;
  } else {
    try {
      await PasswordReset.create({
        userId: user._id,
        tokenHash: hashResetToken(token),
        expiresAt,
        lastSentAt: now,
      });
    } catch (error) {
      if (error.code === 11000) return;
      throw error;
    }
  }

  try {
    await sendEmail({ to: user.email, resetUrl: resetUrl.href, expiresAt });
  } catch {
    await PasswordReset.updateOne(
      { userId: user._id, tokenHash: hashResetToken(token), usedAt: null },
      { $set: { usedAt: new Date() } }
    );
    throw new Error("Password reset email could not be accepted by the provider");
  }
}

export async function completePasswordReset({ token, password }) {
  const reset = await PasswordReset.findOne({
    tokenHash: hashResetToken(token.trim()),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).select("+tokenHash");

  if (!reset) {
    const error = new Error("INVALID_OR_EXPIRED_RESET_TOKEN");
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = await hashPassword(password);
  const consumed = await PasswordReset.findOneAndUpdate(
    {
      _id: reset._id,
      tokenHash: reset.tokenHash,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!consumed) {
    const error = new Error("INVALID_OR_EXPIRED_RESET_TOKEN");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOneAndUpdate(
    { _id: reset.userId, isActive: true },
    { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
    { returnDocument: "after" }
  );
  if (!user) {
    const error = new Error("INVALID_OR_EXPIRED_RESET_TOKEN");
    error.statusCode = 400;
    throw error;
  }
}