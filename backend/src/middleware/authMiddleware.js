import { verifyAccessToken, getAccessTokenFromRequest } from "../utils/jwt.js";
import User from "../models/User.js";

function tokenMatchesUser(decoded, user) {
  return (decoded.tokenVersion ?? 0) === user.tokenVersion;
}

/**
 * Authentication middleware.
 * Verifies JWT token from HttpOnly cookie (or Bearer header) and loads fresh user from database.
 */
export async function authenticate(req, res, next) {
  try {
    const token = getAccessTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        message: "Authentication required: No token provided",
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "Token has expired",
        });
      }
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    if (!decoded || !decoded.sub) {
      return res.status(401).json({
        message: "Invalid token payload",
      });
    }

    // Retrieve fresh user from database (checks existence and active status)
    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({
        message: "User not found or deleted",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        message: "Account has been deactivated",
      });
    }
    if (!tokenMatchesUser(decoded, user)) {
      return res.status(401).json({ message: "Authentication session has been revoked" });
    }

    // Attach trusted identity to req.user
    req.user = {
      id: user._id.toString(),
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return res.status(500).json({
      message: "Internal server error during authentication",
    });
  }
}

/**
 * Optional authentication middleware.
 * Attempts to identify the user from a cookie or Bearer token.
 * If a valid token is found, sets req.user. If no token or an invalid token is
 * present, silently continues without setting req.user (anonymous access).
 * Used for mixed-access endpoints (e.g. GET /api/journals/:id).
 */
export async function optionalAuthenticate(req, res, next) {
  try {
    const token = getAccessTokenFromRequest(req);

    if (!token) return next();

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      // Invalid or expired token — treat as anonymous
      return next();
    }

    if (!decoded || !decoded.sub) return next();

    const user = await User.findById(decoded.sub);
    if (user && user.isActive && tokenMatchesUser(decoded, user)) {
      req.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      };
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error.message);
    next(); // Always continue — never block on optional auth
  }
}
