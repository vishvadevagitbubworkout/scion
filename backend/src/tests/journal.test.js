import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnvironment } from "./testHelper.js";
import User from "../models/User.js";
import { hashPassword } from "../utils/password.js";

describe("Workflow 7 & 8: Journal CRUD, Privacy of Drafts, and Permissions", () => {
  let env;
  let author1Client;
  let author2Client;
  let rootClient;
  let viewerClient;
  let anonClient;
  let journalId;

  before(async () => {
    env = await setupTestEnvironment("scion_test_journal");

    await User.create([
      {
        name: "Author One",
        email: "author1@example.com",
        passwordHash: await hashPassword("AuthorOnePassword123!"),
        role: "AUTHOR",
        isActive: true,
      },
      {
        name: "Author Two",
        email: "author2@example.com",
        passwordHash: await hashPassword("AuthorTwoPassword123!"),
        role: "AUTHOR",
        isActive: true,
      },
      {
        name: "Root Editor",
        email: "root-editor@example.com",
        passwordHash: await hashPassword("RootEditorPass123!"),
        role: "ROOT",
        isActive: true,
      },
      {
        name: "Reader Viewer",
        email: "reader@example.com",
        passwordHash: await hashPassword("ReaderPass123!"),
        role: "VIEWER",
        isActive: true,
      },
    ]);

    author1Client = env.createClient();
    await author1Client.post("/api/auth/login", {
      email: "author1@example.com",
      password: "AuthorOnePassword123!",
    });

    author2Client = env.createClient();
    await author2Client.post("/api/auth/login", {
      email: "author2@example.com",
      password: "AuthorTwoPassword123!",
    });

    rootClient = env.createClient();
    await rootClient.post("/api/auth/login", {
      email: "root-editor@example.com",
      password: "RootEditorPass123!",
    });

    viewerClient = env.createClient();
    await viewerClient.post("/api/auth/login", {
      email: "reader@example.com",
      password: "ReaderPass123!",
    });

    anonClient = env.createClient();
  });

  after(async () => {
    await env.teardown();
  });

  test("7.1 Author creates a new draft journal", async () => {
    const res = await author1Client.post("/api/journals", {
      title: "Quantum Computing Advances in 2026",
      abstract: "An overview of fault-tolerant qubit architectures and algorithms.",
      content: "Full scientific text with detailed methodologies and results...",
      domain: "Physics",
    });

    assert.equal(res.status, 201, "Journal creation should return 201");
    assert.equal(res.body.journal.title, "Quantum Computing Advances in 2026");
    assert.equal(res.body.journal.status, "DRAFT", "New journal must default to DRAFT status");
    journalId = res.body.journal.id;
  });

  test("8.1 Draft journal is private: Hidden from public listing and unauthenticated access", async () => {
    // Public list should return 0 published journals
    const publicList = await anonClient.get("/api/journals");
    assert.equal(publicList.status, 200);
    assert.equal(publicList.body.journals.length, 0, "Draft journal must NOT appear in public list");

    // Anonymous direct ID access to draft journal returns 404 or 403
    const anonDirect = await anonClient.get(`/api/journals/${journalId}`);
    assert.ok([403, 404].includes(anonDirect.status), "Draft journal must be inaccessible to anonymous users");

    // Viewer direct ID access returns 403 or 404
    const viewerDirect = await viewerClient.get(`/api/journals/${journalId}`);
    assert.ok([403, 404].includes(viewerDirect.status), "Draft journal must be inaccessible to VIEWER users");

    // Author 2 (different author) cannot view Author 1's draft
    const author2Direct = await author2Client.get(`/api/journals/${journalId}`);
    assert.ok([403, 404].includes(author2Direct.status), "Draft journal must be inaccessible to other authors");

    // Author 1 (owner) can view their own draft
    const ownerDirect = await author1Client.get(`/api/journals/${journalId}`);
    assert.equal(ownerDirect.status, 200, "Owner must be able to view their own draft");

    // ROOT can view any draft
    const rootDirect = await rootClient.get(`/api/journals/${journalId}`);
    assert.equal(rootDirect.status, 200, "ROOT must be able to view any draft journal");
  });

  test("7.2 Other authors cannot edit, publish, or delete Author 1's journal", async () => {
    // Author 2 tries to update
    const updateRes = await author2Client.put(`/api/journals/${journalId}`, {
      title: "Malicious Edit by Rival Author",
    });
    assert.equal(updateRes.status, 403, "Other author must receive 403 Forbidden on update");

    // Author 2 tries to publish
    const publishRes = await author2Client.patch(`/api/journals/${journalId}/publish`);
    assert.equal(publishRes.status, 403, "Other author must receive 403 Forbidden on publish");

    // Author 2 tries to delete
    const deleteRes = await author2Client.delete(`/api/journals/${journalId}`);
    assert.equal(deleteRes.status, 403, "Other author must receive 403 Forbidden on delete");
  });

  test("7.3 Owner can update and publish their own journal", async () => {
    // Author 1 updates title
    const updateRes = await author1Client.put(`/api/journals/${journalId}`, {
      title: "Quantum Computing Advances in 2026 (Peer-Reviewed Edition)",
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.journal.title, "Quantum Computing Advances in 2026 (Peer-Reviewed Edition)");

    // Author 1 publishes journal
    const publishRes = await author1Client.patch(`/api/journals/${journalId}/publish`);
    assert.equal(publishRes.status, 200);
    assert.equal(publishRes.body.journal.status, "PUBLISHED");
    assert.ok(publishRes.body.journal.publishedAt, "Must record publishedAt timestamp");
  });

  test("7.4 Public users can read published journals and use search/filter", async () => {
    // Public list should now include the published journal
    const publicList = await anonClient.get("/api/journals");
    assert.equal(publicList.status, 200);
    assert.equal(publicList.body.journals.length, 1);
    assert.equal(publicList.body.journals[0].title, "Quantum Computing Advances in 2026 (Peer-Reviewed Edition)");

    // Public direct view
    const directView = await anonClient.get(`/api/journals/${journalId}`);
    assert.equal(directView.status, 200);

    // Search query matching title
    const searchMatch = await anonClient.get("/api/journals?search=Quantum");
    assert.equal(searchMatch.body.journals.length, 1);

    // Search query not matching
    const searchMiss = await anonClient.get("/api/journals?search=NonExistentSubject");
    assert.equal(searchMiss.body.journals.length, 0);

    // Domain filter matching
    const domainMatch = await anonClient.get("/api/journals?domain=Physics");
    assert.equal(domainMatch.body.journals.length, 1);

    // Domain filter not matching
    const domainMiss = await anonClient.get("/api/journals?domain=Biology");
    assert.equal(domainMiss.body.journals.length, 0);
  });

  test("7.5 ROOT has administrative permission to delete any journal", async () => {
    const rootDelete = await rootClient.delete(`/api/journals/${journalId}`);
    assert.equal(rootDelete.status, 200, "ROOT should be permitted to delete journal");

    const checkRes = await anonClient.get(`/api/journals/${journalId}`);
    assert.equal(checkRes.status, 404, "Deleted journal must return 404");
  });
});
