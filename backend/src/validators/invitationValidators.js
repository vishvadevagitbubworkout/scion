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
  const {
    fullName,
    displayName,
    username,
    password,
    confirmPassword,
    bio,
  } = body;

  if (typeof fullName !== "string" || !fullName.trim()) {
    errors.push("Full name is required");
  } else if (fullName.trim().length < 2) {
    errors.push("Full name must be at least 2 characters long");
  } else if (fullName.trim().length > 100) {
    errors.push("Full name cannot exceed 100 characters");
  }

  if (typeof displayName !== "string" || !displayName.trim()) {
    errors.push("Display name is required");
  } else if (displayName.trim().length < 2) {
    errors.push("Display name must be at least 2 characters long");
  } else if (displayName.trim().length > 60) {
    errors.push("Display name cannot exceed 60 characters");
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
  } else if (password.length < 12) {
    errors.push("Password must be at least 12 characters long");
  } else if (password.length > 128) {
    errors.push("Password cannot exceed 128 characters");
  }

  if (typeof confirmPassword !== "string" || !confirmPassword) {
    errors.push("Password confirmation is required");
  } else if (password !== confirmPassword) {
    errors.push("Passwords do not match");
  }

  if (bio !== undefined && typeof bio !== "string") {
    errors.push("Bio must be text");
  } else if (typeof bio === "string" && bio.trim().length > 280) {
    errors.push("Bio cannot exceed 280 characters");
  }

  return {
    errors,
    sanitized: {
      fullName: typeof fullName === "string" ? fullName.trim() : "",
      displayName: typeof displayName === "string" ? displayName.trim() : "",
      username: typeof username === "string" ? username.trim().toLowerCase() : "",
      password: typeof password === "string" ? password : "",
      confirmPassword: typeof confirmPassword === "string" ? confirmPassword : "",
      bio: typeof bio === "string" ? bio.trim() : "",
    },
  };
}
