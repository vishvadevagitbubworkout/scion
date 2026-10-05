const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

/**
 * Validates send OTP input payload.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: { email?: string } }}
 */
export function validateSendOtpInput(body = {}) {
  const errors = [];
  const { email } = body;

  if (typeof email !== "string" || !email.trim()) {
    errors.push("Email is required");
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.push("A valid email address is required");
  }

  return {
    errors,
    sanitized: {
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
    },
  };
}

/**
 * Validates OTP verification payload.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: { email?: string, otp?: string } }}
 */
export function validateVerifyOtpInput(body = {}) {
  const errors = [];
  const { email, otp } = body;

  if (typeof email !== "string" || !email.trim()) {
    errors.push("Email is required");
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.push("A valid email address is required");
  }

  if (typeof otp !== "string" || !otp.trim()) {
    errors.push("OTP is required");
  } else if (!OTP_REGEX.test(otp.trim())) {
    errors.push("OTP must be exactly 6 digits");
  }

  return {
    errors,
    sanitized: {
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
      otp: typeof otp === "string" ? otp.trim() : "",
    },
  };
}

/**
 * Validates invitation creation payload.
 * Requires verified email and verificationToken.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: { email?: string, verificationToken?: string } }}
 */
export function validateCreateInvitationInput(body = {}) {
  const errors = [];
  const { email, verificationToken } = body;

  if (typeof email !== "string" || !email.trim()) {
    errors.push("Email is required");
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.push("A valid email address is required");
  }

  if (typeof verificationToken !== "string" || !verificationToken.trim()) {
    errors.push("Verification token is required. Please verify email OTP first.");
  }

  return {
    errors,
    sanitized: {
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
      verificationToken:
        typeof verificationToken === "string" ? verificationToken.trim() : "",
    },
  };
}

/**
 * Validates author account setup completion payload.
 * Note: Only setupToken, username, password, confirmPassword are accepted.
 * Role and email are derived on the backend.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: { setupToken?: string, username?: string, password?: string } }}
 */
export function validateCompleteSetupInput(body = {}) {
  const errors = [];
  const { setupToken, username, password, confirmPassword } = body;

  if (typeof setupToken !== "string" || !setupToken.trim()) {
    errors.push("Setup authorization token is required");
  }

  if (typeof username !== "string" || !username.trim()) {
    errors.push("Username is required");
  } else if (username.trim().length < 3) {
    errors.push("Username must be at least 3 characters long");
  } else if (username.trim().length > 30) {
    errors.push("Username cannot exceed 30 characters");
  } else if (!USERNAME_REGEX.test(username.trim())) {
    errors.push(
      "Username can only contain letters, numbers, underscores, dots, and hyphens"
    );
  }

  if (typeof password !== "string" || !password) {
    errors.push("Password is required");
  } else if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  } else if (password.length > 128) {
    errors.push("Password cannot exceed 128 characters");
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    errors.push("Passwords do not match");
  }

  return {
    errors,
    sanitized: {
      setupToken: typeof setupToken === "string" ? setupToken.trim() : "",
      username: typeof username === "string" ? username.trim().toLowerCase() : "",
      password: typeof password === "string" ? password : "",
    },
  };
}
