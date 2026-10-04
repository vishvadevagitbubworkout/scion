import {
  createInvitation,
  getAllInvitations,
  revokeInvitation,
  validateInvitationToken,
  verifyInvitationOtp,
  completeAuthorSetup,
} from "../services/invitationService.js";
import {
  validateCreateInvitationInput,
  validateVerifyOtpInput,
  validateCompleteSetupInput,
} from "../validators/invitationValidators.js";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  getAuthCookieOptions,
} from "../utils/jwt.js";

/**
 * POST /api/invitations
 * Creates a new author invitation.
 * Access: ROOT only.
 */
export async function createInvitationHandler(req, res) {
  try {
    const { errors, sanitized } = validateCreateInvitationInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const result = await createInvitation({
      email: sanitized.email,
      invitedById: req.user.id,
    });

    return res.status(201).json({
      message: "Author invitation created successfully",
      invitation: result.invitation,
      invitationToken: result.invitationToken,
      otp: result.otp,
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

    console.error("Create invitation error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/invitations
 * Returns list of invitations.
 * Access: ROOT only.
 */
export async function getInvitationsHandler(req, res) {
  try {
    const invitations = await getAllInvitations();
    return res.status(200).json({ invitations });
  } catch (error) {
    console.error("Get invitations error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PATCH /api/invitations/:id/revoke
 * Revokes a pending invitation.
 * Access: ROOT only.
 */
export async function revokeInvitationHandler(req, res) {
  try {
    const { id } = req.params;
    const invitation = await revokeInvitation({
      invitationId: id,
      rootUserId: req.user.id,
    });

    return res.status(200).json({
      message: "Invitation revoked successfully",
      invitation,
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ message: "Invitation not found" });
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
 * Validates invitation token.
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
      return res.status(410).json({ message: "This invitation has expired" });
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
 * POST /api/invitations/verify-otp
 * Verifies OTP and returns short-lived setupToken.
 * Access: Public.
 */
export async function verifyOtpHandler(req, res) {
  try {
    const { errors, sanitized } = validateVerifyOtpInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const result = await verifyInvitationOtp({
      token: sanitized.token,
      otp: sanitized.otp,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 429) {
      return res.status(429).json({
        message:
          "Maximum OTP verification attempts exceeded. This invitation has been revoked.",
      });
    }
    if (error.statusCode === 410) {
      return res.status(410).json({ message: "This invitation has expired" });
    }
    if (error.statusCode === 404) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    if (error.statusCode === 400) {
      if (error.message === "INVALID_OTP") {
        return res.status(400).json({
          message: `Invalid OTP. ${error.remainingAttempts} attempt(s) remaining.`,
          remainingAttempts: error.remainingAttempts,
        });
      }
      if (error.message === "INVITATION_REVOKED") {
        return res.status(400).json({ message: "This invitation has been revoked" });
      }
      if (error.message === "INVITATION_ALREADY_USED") {
        return res.status(400).json({ message: "This invitation has already been accepted" });
      }
      return res.status(400).json({ message: "Invalid invitation" });
    }

    console.error("Verify OTP error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /api/invitations/complete
 * Completes author setup with setupToken and creates AUTHOR User.
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
      name: sanitized.name,
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
      return res.status(410).json({
        message: "Setup token or invitation has expired. Please verify your OTP again.",
      });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({
        message: error.message === "INVALID_OR_EXPIRED_SETUP_TOKEN"
          ? "Invalid or expired setup authorization. Please verify your OTP again."
          : error.message,
      });
    }

    console.error("Complete author setup error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}
