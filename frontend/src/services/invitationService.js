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
   * ROOT creates a new author invitation.
   * @param {{ email: string }} payload
   */
  async createInvitation({ email }) {
    return await request("/invitations", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  /**
   * ROOT retrieves all author invitations.
   */
  async getInvitations() {
    return await request("/invitations", {
      method: "GET",
    });
  },

  /**
   * ROOT revokes a pending invitation.
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
   * Public verification of 6-digit OTP for an invitation.
   * @param {{ token: string, otp: string }} payload
   */
  async verifyOtp({ token, otp }) {
    return await request("/invitations/verify-otp", {
      method: "POST",
      body: JSON.stringify({ token, otp }),
    });
  },

  /**
   * Public completion of author account setup with setupToken.
   * @param {{ setupToken: string, name: string, password: string }} payload
   */
  async completeSetup({ setupToken, name, password }) {
    return await request("/invitations/complete", {
      method: "POST",
      body: JSON.stringify({ setupToken, name, password }),
    });
  },
};

export default invitationService;
