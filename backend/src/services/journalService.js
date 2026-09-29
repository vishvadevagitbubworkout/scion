import Journal from "../models/Journal.js";
import mongoose from "mongoose";

/**
 * Returns true if the given string is a valid MongoDB ObjectId.
 * @param {string} id
 * @returns {boolean}
 */
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Creates a new journal with status DRAFT.
 * The authorId MUST come from the authenticated user — never from the request body.
 * @param {{ title: string, abstract: string, content: string, domain: string, authorId: string }} data
 * @returns {Promise<Document>}
 */
export async function createJournal({ title, abstract, content, domain, authorId }) {
  return Journal.create({
    title,
    abstract,
    content,
    domain,
    authorId,
    status: "DRAFT",
    publishedAt: null,
  });
}

/**
 * Retrieves a journal by ID with the author's name populated.
 * Returns null if the ID is invalid or the journal does not exist.
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export async function getJournalById(id) {
  if (!isValidId(id)) return null;
  return Journal.findById(id).populate("authorId", "name");
}

/**
 * Retrieves all journals belonging to the given author, newest first.
 * @param {string} authorId
 * @returns {Promise<Document[]>}
 */
export async function getMyJournals(authorId) {
  return Journal.find({ authorId }).sort({ updatedAt: -1 });
}

/**
 * Updates specified fields of a journal.
 * Uses $set so only provided fields are modified.
 * @param {string} id
 * @param {object} updates - Sanitized fields to update
 * @returns {Promise<Document|null>}
 */
export async function updateJournal(id, updates) {
  if (!isValidId(id)) return null;
  return Journal.findByIdAndUpdate(
    id,
    { $set: updates },
    { returnDocument: "after", runValidators: true }
  );
}


/**
 * Deletes a journal by ID.
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export async function deleteJournal(id) {
  if (!isValidId(id)) return null;
  return Journal.findByIdAndDelete(id);
}

/**
 * Publishes a journal. Idempotent — safe to call on an already-published journal.
 * Sets status to PUBLISHED and records publishedAt timestamp.
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export async function publishJournal(id) {
  if (!isValidId(id)) return null;
  const journal = await Journal.findById(id);
  if (!journal) return null;

  if (journal.status === "PUBLISHED") {
    return journal; // Already published — no-op
  }

  journal.status = "PUBLISHED";
  journal.publishedAt = new Date();
  await journal.save();
  return journal;
}

/**
 * Retrieves all published journals for the public listing.
 * The status filter is enforced at the database level — drafts are never included.
 * @returns {Promise<Document[]>}
 */
export async function getPublishedJournals() {
  return Journal.find({ status: "PUBLISHED" })
    .populate("authorId", "name")
    .sort({ publishedAt: -1 });
}
