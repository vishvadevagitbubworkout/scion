import User from "../models/User.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateAccessToken } from "../utils/jwt.js";

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
export async function loginUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordHash +isActive"
  );

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
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}