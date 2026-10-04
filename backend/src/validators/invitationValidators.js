const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;

/**
 * Validates invitation creation payload.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: { email?: string } }}
 */
export function validateCreateInvitationInput(body = {}) {
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
 * @returns {{ errors: string[], sanitized: { token?: string, otp?: string } }}
 */
export function validateVerifyOtpInput(body = {}) {
  const errors = [];
  const { token, otp } = body;

  if (typeof token !== "string" || !token.trim()) {
    errors.push("Invitation token is required");
  }

  if (typeof otp !== "string" || !otp.trim()) {
    errors.push("OTP is required");
  } else if (!OTP_REGEX.test(otp.trim())) {
    errors.push("OTP must be exactly 6 digits");
  }

  return {
    errors,
    sanitized: {
      token: typeof token === "string" ? token.trim() : "",
      otp: typeof otp === "string" ? otp.trim() : "",
    },
  };
}

/**
 * Validates author account setup completion payload.
 * Note: Only setupToken, name, and password are accepted.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: { setupToken?: string, name?: string, password?: string } }}
 */
export function validateCompleteSetupInput(body = {}) {
  const errors = [];
  const { setupToken, name, password } = body;

  if (typeof setupToken !== "string" || !setupToken.trim()) {
    errors.push("Setup authorization token is required");
  }

  if (typeof name !== "string" || !name.trim()) {
    errors.push("Name is required");
  } else if (name.trim().length < 2) {
    errors.push("Name must be at least 2 characters long");
  } else if (name.trim().length > 100) {
    errors.push("Name cannot exceed 100 characters");
  }

  if (typeof password !== "string" || !password) {
    errors.push("Password is required");
  } else if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  } else if (password.length > 128) {
    errors.push("Password cannot exceed 128 characters");
  }

  return {
    errors,
    sanitized: {
      setupToken: typeof setupToken === "string" ? setupToken.trim() : "",
      name: typeof name === "string" ? name.trim() : "",
      password: typeof password === "string" ? password : "",
    },
  };
}
