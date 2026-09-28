const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/**
 * Common request helper with credentials: "include" for HttpOnly cookies.
 */
async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const config = {
    ...options,
    credentials: "include", // Essential for HttpOnly cookie authentication
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const authService = {
  /**
   * Registers a new user account (VIEWER).
   * @param {{ name: string, email: string, password: string }} userData
   */
  async register({ name, email, password }) {
    return await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  /**
   * Logs into an existing account, setting HttpOnly cookie.
   * @param {{ email: string, password: string }} credentials
   */
  async login({ email, password }) {
    return await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  /**
   * Logs out the current user, clearing HttpOnly cookie.
   */
  async logout() {
    return await request("/auth/logout", {
      method: "POST",
    });
  },

  /**
   * Fetches the currently authenticated user's profile.
   */
  async getCurrentUser() {
    return await request("/auth/me", {
      method: "GET",
    });
  },
};

export default authService;
