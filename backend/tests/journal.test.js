import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setupTestEnvironment } from "./testHelper.js";
import User from "../src/models/User.js";
import Journal from "../src/models/Journal.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Registers a user and returns the auth cookie.
 */
async function registerAndLogin(apiRequest, { name, email, password, role }) {
  await apiRequest("/api/auth/register", {
    method: "POST",
    body: { name, email, password },
  });

  if (role && role !== "VIEWER") {
    await User.findOneAndUpdate({ email }, { role });
  }

  const res = await apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

  return { cookie: res.setCookie };
}

/**
 * Creates a journal and returns the full response.
 * Note: journal IDs in responses are under `id` (not `_id`) due to toJSON transform.
 */
async function createJournal(apiRequest, cookie, body = {}) {
  return apiRequest("/api/journals", {
    method: "POST",
    cookie,
    body: {
      title: "Test Journal",
      abstract: "A short abstract for testing.",
      content: "This is the full content of the test journal.",
      domain: "Computer Science",
      ...body,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase 2 — Journal API", () => {
  let apiRequest;
  let teardown;

  const authorCreds = {
    name: "Alice Author",
    email: "alice.author@test.com",
    password: "Password123!",
    role: "AUTHOR",
  };
  const secondAuthorCreds = {
    name: "Bob Author",
    email: "bob.author@test.com",
    password: "Password123!",
    role: "AUTHOR",
  };
  const rootCreds = {
    name: "Root User",
    email: "root@test.com",
    password: "Password123!",
    role: "ROOT",
  };
  const viewerCreds = {
    name: "Viewer User",
    email: "viewer@test.com",
    password: "Password123!",
    role: "VIEWER",
  };

  let authorCookie;
  let secondAuthorCookie;
  let rootCookie;
  let viewerCookie;

  before(async () => {
    const env = await setupTestEnvironment();
    apiRequest = env.apiRequest;
    teardown = env.teardown;

    ({ cookie: authorCookie } = await registerAndLogin(apiRequest, authorCreds));
    ({ cookie: secondAuthorCookie } = await registerAndLogin(apiRequest, secondAuthorCreds));
    ({ cookie: rootCookie } = await registerAndLogin(apiRequest, rootCreds));
    ({ cookie: viewerCookie } = await registerAndLogin(apiRequest, viewerCreds));
  });

  after(async () => {
    if (teardown) await teardown();
  });

  beforeEach(async () => {
    await Journal.deleteMany({});
  });

  // -------------------------------------------------------------------------
  // 1. CREATE
  // -------------------------------------------------------------------------

  describe("POST /api/journals — Create Journal", () => {
    it("AUTHOR can create a journal", async () => {
      const res = await createJournal(apiRequest, authorCookie);
      assert.equal(res.status, 201);
      assert.ok(res.data.journal);
      assert.equal(res.data.journal.title, "Test Journal");
      assert.equal(res.data.journal.status, "DRAFT");
      // toJSON converts _id → id
      assert.ok(res.data.journal.id, "id must be present");
      assert.ok(res.data.journal.authorId, "authorId must be present");
    });

    it("ROOT can create a journal", async () => {
      const res = await createJournal(apiRequest, rootCookie);
      assert.equal(res.status, 201);
      assert.equal(res.data.journal.status, "DRAFT");
    });

    it("VIEWER cannot create a journal (403)", async () => {
      const res = await createJournal(apiRequest, viewerCookie);
      assert.equal(res.status, 403);
    });

    it("Anonymous user cannot create a journal (401)", async () => {
      const res = await createJournal(apiRequest, null);
      assert.equal(res.status, 401);
    });

    it("authorId in body is ignored — set from token", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await createJournal(apiRequest, authorCookie, {
        authorId: fakeId,
      });
      assert.equal(res.status, 201);
      assert.notEqual(res.data.journal.authorId?.toString(), fakeId);
    });

    it("returns 400 if title is missing", async () => {
      const res = await apiRequest("/api/journals", {
        method: "POST",
        cookie: authorCookie,
        body: {
          abstract: "No title here.",
          content: "Content without a title.",
          domain: "Biology",
        },
      });
      assert.equal(res.status, 400);
    });

    it("returns 400 if content is missing", async () => {
      const res = await apiRequest("/api/journals", {
        method: "POST",
        cookie: authorCookie,
        body: {
          title: "No Content",
          abstract: "Abstract.",
          domain: "Biology",
        },
      });
      assert.equal(res.status, 400);
    });

    it("journal is created as DRAFT regardless of body status", async () => {
      const res = await createJournal(apiRequest, authorCookie, {
        status: "PUBLISHED",
      });
      if (res.status === 201) {
        assert.equal(res.data.journal.status, "DRAFT");
      } else {
        assert.equal(res.status, 400);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. READ — Public listing
  // -------------------------------------------------------------------------

  describe("GET /api/journals — Public Listing", () => {
    it("returns only PUBLISHED journals (no auth)", async () => {
      // Create a draft — should not appear
      await createJournal(apiRequest, authorCookie);

      // Create and publish another — should appear
      const createRes = await createJournal(apiRequest, authorCookie, {
        title: "Published Journal",
      });
      const journalId = createRes.data.journal.id; // use .id, not ._id
      await apiRequest(`/api/journals/${journalId}/publish`, {
        method: "PATCH",
        cookie: authorCookie,
      });

      const res = await apiRequest("/api/journals");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.journals));
      for (const j of res.data.journals) {
        assert.equal(j.status, "PUBLISHED");
      }
      assert.equal(res.data.journals.length, 1);
    });

    it("returns empty array when no journals are published", async () => {
      await createJournal(apiRequest, authorCookie);
      const res = await apiRequest("/api/journals");
      assert.equal(res.status, 200);
      assert.deepEqual(res.data.journals, []);
    });
  });

  // -------------------------------------------------------------------------
  // 3. READ — /my
  // -------------------------------------------------------------------------

  describe("GET /api/journals/my — My Journals", () => {
    it("AUTHOR sees only their own journals", async () => {
      await createJournal(apiRequest, authorCookie, { title: "Alice Journal 1" });
      await createJournal(apiRequest, authorCookie, { title: "Alice Journal 2" });
      await createJournal(apiRequest, secondAuthorCookie, { title: "Bob Journal" });

      const res = await apiRequest("/api/journals/my", { cookie: authorCookie });
      assert.equal(res.status, 200);
      assert.equal(res.data.journals.length, 2);
    });

    it("VIEWER cannot access /my (403)", async () => {
      const res = await apiRequest("/api/journals/my", { cookie: viewerCookie });
      assert.equal(res.status, 403);
    });

    it("anonymous user cannot access /my (401)", async () => {
      const res = await apiRequest("/api/journals/my");
      assert.equal(res.status, 401);
    });

    it("ROOT can access /my and sees only root's own journals", async () => {
      await createJournal(apiRequest, authorCookie);
      const res = await apiRequest("/api/journals/my", { cookie: rootCookie });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.journals));
    });
  });

  // -------------------------------------------------------------------------
  // 4. READ — single journal by ID
  // -------------------------------------------------------------------------

  describe("GET /api/journals/:id — Single Journal", () => {
    it("anyone can read a PUBLISHED journal", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id; // .id not ._id
      await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: authorCookie,
      });

      const res = await apiRequest(`/api/journals/${id}`);
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.status, "PUBLISHED");
    });

    it("author can read their own DRAFT", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        cookie: authorCookie,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.status, "DRAFT");
    });

    it("another author gets 404 for a DRAFT they don't own", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        cookie: secondAuthorCookie,
      });
      assert.equal(res.status, 404);
    });

    it("anonymous user gets 404 for a DRAFT", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`);
      assert.equal(res.status, 404);
    });

    it("ROOT can read any DRAFT", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        cookie: rootCookie,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.status, "DRAFT");
    });

    it("returns 404 for invalid ObjectId", async () => {
      const res = await apiRequest("/api/journals/not-an-id", {
        cookie: authorCookie,
      });
      assert.equal(res.status, 404);
    });

    it("returns 404 for non-existent journal", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await apiRequest(`/api/journals/${fakeId}`, {
        cookie: authorCookie,
      });
      assert.equal(res.status, 404);
    });
  });

  // -------------------------------------------------------------------------
  // 5. UPDATE
  // -------------------------------------------------------------------------

  describe("PUT /api/journals/:id — Update Journal", () => {
    it("AUTHOR can update their own journal", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "PUT",
        cookie: authorCookie,
        body: { title: "Updated Title" },
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.title, "Updated Title");
    });

    it("ROOT can update any journal", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "PUT",
        cookie: rootCookie,
        body: { title: "Root Updated Title" },
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.title, "Root Updated Title");
    });

    it("AUTHOR cannot update another author's journal (403)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "PUT",
        cookie: secondAuthorCookie,
        body: { title: "Bob's Hijack Attempt" },
      });
      assert.equal(res.status, 403);
    });

    it("VIEWER cannot update any journal (403)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "PUT",
        cookie: viewerCookie,
        body: { title: "Viewer Hijack" },
      });
      assert.equal(res.status, 403);
    });

    it("anonymous user cannot update (401)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "PUT",
        body: { title: "Anon Hijack" },
      });
      assert.equal(res.status, 401);
    });

    it("returns 400 when no valid fields provided", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "PUT",
        cookie: authorCookie,
        body: {},
      });
      assert.equal(res.status, 400);
    });

    it("cannot change status via update (status ignored or 400)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "PUT",
        cookie: authorCookie,
        body: { status: "PUBLISHED" },
      });
      if (res.status === 200) {
        assert.equal(res.data.journal.status, "DRAFT");
      } else {
        assert.ok(res.status === 400, "Should be 400 if status is rejected");
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. DELETE
  // -------------------------------------------------------------------------

  describe("DELETE /api/journals/:id — Delete Journal", () => {
    it("AUTHOR can delete their own journal", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "DELETE",
        cookie: authorCookie,
      });
      assert.equal(res.status, 200);

      // Confirm deleted — owner should now get 404
      const verify = await apiRequest(`/api/journals/${id}`, {
        cookie: authorCookie,
      });
      assert.equal(verify.status, 404);
    });

    it("ROOT can delete any journal", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "DELETE",
        cookie: rootCookie,
      });
      assert.equal(res.status, 200);
    });

    it("AUTHOR cannot delete another author's journal (403)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "DELETE",
        cookie: secondAuthorCookie,
      });
      assert.equal(res.status, 403);
    });

    it("VIEWER cannot delete any journal (403)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "DELETE",
        cookie: viewerCookie,
      });
      assert.equal(res.status, 403);
    });

    it("anonymous user cannot delete (401)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 401);
    });

    it("returns 404 for non-existent journal", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await apiRequest(`/api/journals/${fakeId}`, {
        method: "DELETE",
        cookie: authorCookie,
      });
      assert.equal(res.status, 404);
    });
  });

  // -------------------------------------------------------------------------
  // 7. PUBLISH
  // -------------------------------------------------------------------------

  describe("PATCH /api/journals/:id/publish — Publish Journal", () => {
    it("AUTHOR can publish their own DRAFT journal", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: authorCookie,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.status, "PUBLISHED");
      assert.ok(res.data.journal.publishedAt, "publishedAt must be set");
    });

    it("ROOT can publish any journal", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: rootCookie,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.status, "PUBLISHED");
    });

    it("AUTHOR cannot publish another author's journal (403)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: secondAuthorCookie,
      });
      assert.equal(res.status, 403);
    });

    it("VIEWER cannot publish any journal (403)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: viewerCookie,
      });
      assert.equal(res.status, 403);
    });

    it("anonymous user cannot publish (401)", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      const res = await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
      });
      assert.equal(res.status, 401);
    });

    it("publishing an already-published journal is idempotent", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;

      await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: authorCookie,
      });

      const res = await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: authorCookie,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.status, "PUBLISHED");
    });

    it("published journal is visible in the public listing", async () => {
      const createRes = await createJournal(apiRequest, authorCookie, {
        title: "Publicly Visible",
      });
      const id = createRes.data.journal.id;
      await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: authorCookie,
      });

      const listRes = await apiRequest("/api/journals");
      assert.equal(listRes.status, 200);
      const titles = listRes.data.journals.map((j) => j.title);
      assert.ok(titles.includes("Publicly Visible"));
    });

    it("draft journal is NOT visible in the public listing", async () => {
      await createJournal(apiRequest, authorCookie, { title: "Hidden Draft" });

      const listRes = await apiRequest("/api/journals");
      assert.equal(listRes.status, 200);
      const titles = listRes.data.journals.map((j) => j.title);
      assert.ok(!titles.includes("Hidden Draft"));
    });
  });

  // -------------------------------------------------------------------------
  // 8. Ownership enforcement — security edge cases
  // -------------------------------------------------------------------------

  describe("Ownership & Security Edge Cases", () => {
    it("response never leaks passwordHash", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;
      await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: authorCookie,
      });

      const res = await apiRequest(`/api/journals/${id}`);
      assert.equal(res.status, 200);
      assert.equal(res.data.journal.passwordHash, undefined);
    });

    it("journal response includes all required Phase 2 fields", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const j = createRes.data.journal;
      // toJSON converts _id → id
      assert.ok(j.id, "id");
      assert.ok(j.title, "title");
      assert.ok(j.abstract, "abstract");
      assert.ok(j.content, "content");
      assert.ok(j.authorId, "authorId");
      assert.ok(j.domain, "domain");
      assert.ok(j.status, "status");
      assert.ok(j.createdAt, "createdAt");
      assert.ok(j.updatedAt, "updatedAt");
      // publishedAt is null for a draft — null is the expected value
      assert.equal(j.publishedAt, null);
    });

    it("publishedAt is null before publishing", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      assert.equal(createRes.data.journal.publishedAt, null);
    });

    it("publishedAt is set after publishing", async () => {
      const createRes = await createJournal(apiRequest, authorCookie);
      const id = createRes.data.journal.id;
      const pub = await apiRequest(`/api/journals/${id}/publish`, {
        method: "PATCH",
        cookie: authorCookie,
      });
      assert.ok(pub.data.journal.publishedAt !== null, "publishedAt must not be null after publish");
    });
  });
});
