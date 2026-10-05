import {
  registerUser,
  loginUser,
  getUserById,
} from "../services/authService.js";
import {
  validateRegistrationInput,
  validateLoginInput,
} from "../validators/authValidators.js";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  getAuthCookieOptions,
} from "../utils/jwt.js";

/**
 * Handles user registration.
 */
export async function register(req, res) {
  try {
    const { errors, sanitized } = validateRegistrationInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        message: errors[0],
        errors,
      });
    }

    // Explicitly pass only sanitized name, email, password.
    // Any injected role in req.body is completely ignored.
    const user = await registerUser({
      name: sanitized.name,
      email: sanitized.email,
      password: sanitized.password,
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error.statusCode === 409 || error.code === 11000) {
      return res.status(409).json({
        message: "Email already exists",
      });
    }

    console.error("Registration error:", error.message);
    return res.status(500).json({
      message: "Internal server error during registration",
    });
  }
}

/**
 * Handles user login and sets HttpOnly cookie.
 */
export async function login(req, res) {
  try {
    const { errors, sanitized } = validateLoginInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        message: errors[0],
        errors,
      });
    }

    const { user, token } = await loginUser({
      identifier: sanitized.identifier || sanitized.email,
      email: sanitized.email,
      password: sanitized.password,
    });

    const cookieOptions = getAuthCookieOptions();
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, token, cookieOptions);

    return res.status(200).json({
      message: "Login successful",
      user,
    });
  } catch (error) {
    if (error.message === "ACCOUNT_INACTIVE") {
      return res.status(401).json({
        message: "Account has been deactivated",
      });
    }

    if (error.statusCode === 401 || error.message === "INVALID_CREDENTIALS") {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Internal server error during login",
    });
  }
}

/**
 * Handles user logout by clearing the HttpOnly cookie.
 */
export async function logout(req, res) {
  try {
    const cookieOptions = getAuthCookieOptions(0);
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, {
      ...cookieOptions,
      maxAge: 0,
    });

    return res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error.message);
    return res.status(500).json({
      message: "Internal server error during logout",
    });
  }
}

/**
 * Returns currently authenticated user.
 */
export async function getCurrentUser(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    return res.status(200).json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("GetCurrentUser error:", error.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}