import {
  sendVerificationOtp,
  verifyEmailOtp,
  createInvitation,
  getAllInvitations,
  revokeInvitation,
  validateInvitationToken,
  completeAuthorSetup,
} from "../services/invitationService.js";
import {
  validateSendOtpInput,
  validateVerifyOtpInput,
  validateCreateInvitationInput,
  validateCompleteSetupInput,
} from "../validators/invitationValidators.js";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  getAuthCookieOptions,
} from "../utils/jwt.js";

/**
 * POST /api/invitations/send-otp
 * Generates OTP and sends it to invitee's email.
 * Access: ROOT, AUTHOR.
 */
export async function sendOtpHandler(req, res) {
  try {
    const { errors, sanitized } = validateSendOtpInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const result = await sendVerificationOtp({
      email: sanitized.email,
      invitedById: req.user.id,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 409) {
      if (error.message === "ACTIVE_INVITATION_EXISTS") {
        return res.status(409).json({
          message: "An active pending invitation already exists for this email",
        });
      }
      return res.status(409).json({
        message: "A user with this email address is already registered",
      });
    }

    console.error("Send OTP error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /api/invitations/verify-otp
 * Verifies OTP entered by inviter and issues verificationToken.
 * Access: ROOT, AUTHOR.
 */
export async function verifyOtpHandler(req, res) {
  try {
    const { errors, sanitized } = validateVerifyOtpInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const result = await verifyEmailOtp({
      email: sanitized.email,
      otp: sanitized.otp,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 429) {
      return res.status(429).json({
        message:
          "Maximum OTP verification attempts exceeded. Please request a fresh OTP.",
      });
    }
    if (error.statusCode === 410) {
      return res.status(410).json({ message: "OTP has expired. Please request a fresh OTP." });
    }
    if (error.statusCode === 404) {
      return res.status(404).json({ message: "No active OTP request found for this email" });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({
        message: `Invalid OTP. ${error.remainingAttempts !== undefined ? `${error.remainingAttempts} attempt(s) remaining.` : ""}`.trim(),
        remainingAttempts: error.remainingAttempts,
      });
    }

    console.error("Verify OTP error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /api/invitations
 * Creates a new author invitation after email is verified.
 * Sets 2-hour expiry and sends invitation email.
 * Access: ROOT, AUTHOR.
 */
export async function createInvitationHandler(req, res) {
  try {
    const { errors, sanitized } = validateCreateInvitationInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const result = await createInvitation({
      email: sanitized.email,
      verificationToken: sanitized.verificationToken,
      invitedById: req.user.id,
    });

    return res.status(201).json({
      message: "Author invitation sent successfully",
      invitation: result.invitation,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      if (error.message === "EMAIL_ALREADY_REGISTERED") {
        return res.status(409).json({
          message: "A user with this email address is already registered",
        });
      }
      if (error.message === "ACTIVE_INVITATION_EXISTS") {
        return res.status(409).json({
          message: "An active pending invitation already exists for this email",
        });
      }
    }
    if (error.statusCode === 400) {
      return res.status(400).json({
        message:
          error.message === "EMAIL_NOT_VERIFIED"
            ? "Email must be verified with OTP before sending an invitation"
            : error.message,
      });
    }

    console.error("Create invitation error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/invitations
 * Returns list of invitations (ROOT sees all; AUTHOR sees own).
 * Access: ROOT, AUTHOR.
 */
export async function getInvitationsHandler(req, res) {
  try {
    const invitations = await getAllInvitations({
      userId: req.user.id,
      userRole: req.user.role,
    });
    return res.status(200).json({ invitations });
  } catch (error) {
    console.error("Get invitations error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PATCH /api/invitations/:id/revoke
 * Revokes a pending invitation.
 * Access: ROOT, AUTHOR (own invites).
 */
export async function revokeInvitationHandler(req, res) {
  try {
    const { id } = req.params;
    const invitation = await revokeInvitation({
      invitationId: id,
      userId: req.user.id,
      userRole: req.user.role,
    });

    return res.status(200).json({
      message: "Invitation revoked successfully",
      invitation,
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    if (error.statusCode === 403) {
      return res.status(403).json({
        message: "Forbidden: You do not have permission to revoke this invitation",
      });
    }
    if (error.statusCode === 400) {
      if (error.message === "CANNOT_REVOKE_NON_PENDING") {
        return res.status(400).json({
          message: "Only pending invitations can be revoked",
        });
      }
      return res.status(400).json({ message: "Invalid invitation ID" });
    }

    console.error("Revoke invitation error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/invitations/validate?token=...
 * Validates invitation token, checks 2-hour expiry, returns setupToken and pre-filled email.
 * Access: Public.
 */
export async function validateInvitationHandler(req, res) {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ message: "Invitation token is required" });
    }

    const result = await validateInvitationToken(token);
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    if (error.statusCode === 410) {
      return res.status(410).json({
        message: "Invitation Expired. Please request a new invitation.",
      });
    }
    if (error.statusCode === 400) {
      if (error.message === "INVITATION_REVOKED") {
        return res.status(400).json({ message: "This invitation has been revoked" });
      }
      if (error.message === "INVITATION_ALREADY_USED") {
        return res.status(400).json({ message: "This invitation has already been accepted" });
      }
      return res.status(400).json({ message: "Invalid or inactive invitation" });
    }

    console.error("Validate invitation error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /api/invitations/complete
 * Completes author setup with setupToken, username, and password. Creates AUTHOR user.
 * Access: Public.
 */
export async function completeSetupHandler(req, res) {
  try {
    const { errors, sanitized } = validateCompleteSetupInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const { user, token } = await completeAuthorSetup({
      setupToken: sanitized.setupToken,
      username: sanitized.username,
      password: sanitized.password,
    });

    const cookieOptions = getAuthCookieOptions();
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, token, cookieOptions);

    return res.status(201).json({
      message: "Author account created successfully",
      user,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      if (error.message === "USERNAME_ALREADY_EXISTS") {
        return res.status(409).json({
          message: "Username is already taken. Please choose another username.",
        });
      }
      if (error.message === "EMAIL_ALREADY_REGISTERED") {
        return res.status(409).json({
          message:
            "This email address is already registered as an account. Please sign in or contact your administrator.",
        });
      }
      if (error.message === "INVITATION_ALREADY_USED") {
        return res.status(409).json({
          message: "This invitation has already been accepted.",
        });
      }
    }
    if (error.statusCode === 410) {
      if (error.message === "INVITATION_EXPIRED") {
        return res.status(410).json({
          message: "Invitation Expired. Please request a new invitation.",
        });
      }
      return res.status(410).json({
        message: "Setup authorization token has expired. Please re-open your invitation link.",
      });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({
        message:
          error.message === "INVALID_OR_EXPIRED_SETUP_TOKEN"
            ? "Invalid or expired setup authorization. Please re-open your invitation link."
            : error.message,
      });
    }

    console.error("Complete author setup error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}
