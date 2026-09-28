import { verifyAccessToken, ACCESS_TOKEN_COOKIE_NAME } from "../utils/jwt.js";
import User from "../models/User.js";

/**
 * Authentication middleware.
 * Verifies JWT token from HttpOnly cookie (or Bearer header) and loads fresh user from database.
 */
export async function authenticate(req, res, next) {
  try {
    let token = null;

    // Check HttpOnly cookie first
    if (req.cookies && req.cookies[ACCESS_TOKEN_COOKIE_NAME]) {
      token = req.cookies[ACCESS_TOKEN_COOKIE_NAME];
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

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

    // Attach trusted identity to req.user
    req.user = {
      id: user._id.toString(),
      name: user.name,
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
