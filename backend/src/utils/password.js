import argon2 from "argon2";

/**
 * Hashes a plaintext password using Argon2id.
 * @param {string} password - The plaintext password to hash
 * @returns {Promise<string>} The resulting Argon2 hash
 */
export async function hashPassword(password) {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string");
  }

  return await argon2.hash(password, {
    type: argon2.argon2id,
  });
}

/**
 * Verifies a plaintext password against an Argon2 hash.
 * @param {string} password - The plaintext password attempt
 * @param {string} passwordHash - The stored Argon2 hash
 * @returns {Promise<boolean>} True if password matches, false otherwise
 */
export async function verifyPassword(password, passwordHash) {
  if (!password || !passwordHash) {
    return false;
  }

  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
