const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates registration input payload.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: { name?: string, email?: string, password?: string } }}
 */
export function validateRegistrationInput(body = {}) {
  const errors = [];
  const { name, email, password } = body;

  if (typeof name !== "string" || !name.trim()) {
    errors.push("Name is required");
  } else if (name.trim().length < 2) {
    errors.push("Name must be at least 2 characters long");
  } else if (name.trim().length > 100) {
    errors.push("Name cannot exceed 100 characters");
  }

  if (typeof email !== "string" || !email.trim()) {
    errors.push("Email is required");
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.push("A valid email address is required");
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
      name: typeof name === "string" ? name.trim() : "",
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
      password: typeof password === "string" ? password : "",
    },
  };
}

/**
 * Validates login input payload.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: { email?: string, password?: string } }}
 */
export function validateLoginInput(body = {}) {
  const errors = [];
  const { email, username, identifier, password } = body;
  const loginHandle = identifier || email || username;

  if (typeof loginHandle !== "string" || !loginHandle.trim()) {
    errors.push("Email or username is required");
  }

  if (typeof password !== "string" || !password) {
    errors.push("Password is required");
  }

  return {
    errors,
    sanitized: {
      identifier:
        typeof loginHandle === "string" ? loginHandle.trim().toLowerCase() : "",
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
      password: typeof password === "string" ? password : "",
    },
  };
}
