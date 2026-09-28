import jwt from "jsonwebtoken";

const ACCESS_TOKEN_COOKIE_NAME = "scion_access_token";

/**
 * Returns JWT secret from environment, throwing if missing.
 * @returns {string}
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
  }
  return secret;
}

/**
 * Generates an access token for an authenticated user.
 * @param {{ _id: any, role: string }} user
 * @returns {string} Signed JWT
 */
export function generateAccessToken(user) {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  const payload = {
    sub: user._id ? user._id.toString() : user.id,
    role: user.role,
  };

  return jwt.sign(payload, secret, {
    expiresIn,
  });
}

/**
 * Verifies and decodes an access token.
 * @param {string} token
 * @returns {object} Decoded JWT payload
 */
export function verifyAccessToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}

/**
 * Returns cookie options for setting or clearing authentication cookies.
 * @param {number} [maxAgeMs] - Optional lifetime in ms.
 * @returns {import("express").CookieOptions}
 */
export function getAuthCookieOptions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}

export { ACCESS_TOKEN_COOKIE_NAME };
