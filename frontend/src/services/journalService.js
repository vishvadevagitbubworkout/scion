const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/**
 * Common request helper.
 * credentials: "include" ensures HttpOnly auth cookie is always sent.
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

export const journalService = {
  /**
   * Public: returns all PUBLISHED journals.
   */
  async getPublishedJournals() {
    return request("/journals");
  },

  /**
   * Public (or authenticated): returns a single journal by ID.
   * PUBLISHED journals are visible to everyone.
   * DRAFT journals are only visible to the owner or ROOT.
   */
  async getJournalById(id) {
    return request(`/journals/${id}`);
  },

  /**
   * Authenticated (AUTHOR/ROOT): returns the caller's own journals.
   */
  async getMyJournals() {
    return request("/journals/my");
  },

  /**
   * Authenticated (AUTHOR/ROOT): creates a new DRAFT journal.
   * authorId is never sent from the client — the backend derives it from the session.
   * @param {{ title: string, abstract: string, content: string, domain: string }} data
   */
  async createJournal({ title, abstract, content, domain }) {
    return request("/journals", {
      method: "POST",
      body: JSON.stringify({ title, abstract, content, domain }),
    });
  },

  /**
   * Authenticated (AUTHOR owner/ROOT): updates a journal.
   * @param {string} id
   * @param {{ title?: string, abstract?: string, content?: string, domain?: string }} updates
   */
  async updateJournal(id, updates) {
    return request(`/journals/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  },

  /**
   * Authenticated (AUTHOR owner/ROOT): deletes a journal.
   */
  async deleteJournal(id) {
    return request(`/journals/${id}`, { method: "DELETE" });
  },

  /**
   * Authenticated (AUTHOR owner/ROOT): publishes a journal.
   * Idempotent — safe to call on an already-published journal.
   */
  async publishJournal(id) {
    return request(`/journals/${id}/publish`, { method: "PATCH" });
  },
};

export default journalService;
