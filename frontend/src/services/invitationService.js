const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/**
 * Common request helper with credentials: "include" for HttpOnly cookies.
 */
async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const config = {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.message || `Request failed with status ${response.status}`
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const invitationService = {
  /**
   * ROOT or AUTHOR sends OTP to invitee email.
   * @param {{ email: string }} payload
   */
  async sendOtp({ email }) {
    return await request("/invitations/send-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  /**
   * ROOT or AUTHOR verifies OTP received from invitee.
   * @param {{ email: string, otp: string }} payload
   */
  async verifyOtp({ email, otp }) {
    return await request("/invitations/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    });
  },

  /**
   * ROOT or AUTHOR creates a secure invitation after email is verified.
   * @param {{ email: string, verificationToken: string }} payload
   */
  async createInvitation({ email, verificationToken }) {
    return await request("/invitations", {
      method: "POST",
      body: JSON.stringify({ email, verificationToken }),
    });
  },

  /**
   * Retrieves author invitations (ROOT: all; AUTHOR: own).
   */
  async getInvitations() {
    return await request("/invitations", {
      method: "GET",
    });
  },

  /**
   * Revokes a pending invitation.
   * @param {string} id
   */
  async revokeInvitation(id) {
    return await request(`/invitations/${id}/revoke`, {
      method: "PATCH",
    });
  },

  /**
   * Public validation of an invitation token from URL.
   * @param {string} token
   */
  async validateInvitation(token) {
    return await request(
      `/invitations/validate?token=${encodeURIComponent(token)}`,
      {
        method: "GET",
      }
    );
  },

  /**
   * Public completion of author account setup with setupToken, username, and password.
   * @param {{ setupToken: string, username: string, password: string, confirmPassword?: string }} payload
   */
  async completeSetup({ setupToken, username, password, confirmPassword }) {
    return await request("/invitations/complete", {
      method: "POST",
      body: JSON.stringify({ setupToken, username, password, confirmPassword }),
    });
  },
};

export default invitationService;
