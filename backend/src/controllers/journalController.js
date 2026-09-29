import mongoose from "mongoose";
import {
  createJournal,
  getJournalById,
  getMyJournals,
  updateJournal,
  deleteJournal,
  publishJournal,
  getPublishedJournals,
} from "../services/journalService.js";
import {
  validateJournalInput,
  validateUpdateInput,
} from "../validators/journalValidators.js";

/**
 * Returns the authorId string from a journal document, handling both
 * populated (User document) and non-populated (ObjectId) states.
 * @param {Document} journal
 * @returns {string|null}
 */
function getAuthorIdStr(journal) {
  if (!journal.authorId) return null;
  if (journal.authorId._id) {
    return journal.authorId._id.toString();
  }
  return journal.authorId.toString();
}

/**
 * POST /api/journals
 * Creates a new journal as DRAFT.
 * Allowed: AUTHOR, ROOT
 */
export async function createJournalHandler(req, res) {
  try {
    const { errors, sanitized } = validateJournalInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    // authorId comes ONLY from the authenticated user — never from req.body
    const journal = await createJournal({
      title: sanitized.title,
      abstract: sanitized.abstract,
      content: sanitized.content,
      domain: sanitized.domain,
      authorId: req.user.id,
    });

    return res.status(201).json({
      message: "Journal created successfully",
      journal,
    });
  } catch (error) {
    console.error("Create journal error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/journals/my
 * Returns all journals owned by the authenticated user.
 * Allowed: AUTHOR, ROOT
 */
export async function getMyJournalsHandler(req, res) {
  try {
    const journals = await getMyJournals(req.user.id);
    return res.status(200).json({ journals });
  } catch (error) {
    console.error("Get my journals error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/journals/:id
 * Returns a journal by ID.
 * - Published journals: publicly accessible.
 * - Draft journals: owner or ROOT only. Returns 404 to non-owners to avoid leaking existence.
 */
export async function getJournalByIdHandler(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Journal not found" });
    }

    const journal = await getJournalById(id);

    if (!journal) {
      return res.status(404).json({ message: "Journal not found" });
    }

    // Published journals are publicly accessible
    if (journal.status === "PUBLISHED") {
      return res.status(200).json({ journal });
    }

    // Draft: unauthenticated users cannot see it
    if (!req.user) {
      return res.status(404).json({ message: "Journal not found" });
    }

    const authorIdStr = getAuthorIdStr(journal);
    const isOwner = authorIdStr === req.user.id;

    if (req.user.role === "ROOT" || isOwner) {
      return res.status(200).json({ journal });
    }

    // Hide draft existence from non-owners
    return res.status(404).json({ message: "Journal not found" });
  } catch (error) {
    console.error("Get journal by ID error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PUT /api/journals/:id
 * Updates a journal's fields.
 * Allowed: AUTHOR (own journal only), ROOT (any journal)
 */
export async function updateJournalHandler(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Journal not found" });
    }

    const { errors, sanitized } = validateUpdateInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    if (Object.keys(sanitized).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const journal = await getJournalById(id);
    if (!journal) {
      return res.status(404).json({ message: "Journal not found" });
    }

    // Ownership check: AUTHOR may only edit their own journal
    if (req.user.role !== "ROOT") {
      const authorIdStr = getAuthorIdStr(journal);
      if (authorIdStr !== req.user.id) {
        return res.status(403).json({
          message: "Forbidden: You do not have permission to modify this journal",
        });
      }
    }

    const updated = await updateJournal(id, sanitized);
    return res.status(200).json({
      message: "Journal updated successfully",
      journal: updated,
    });
  } catch (error) {
    console.error("Update journal error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * DELETE /api/journals/:id
 * Deletes a journal.
 * Allowed: AUTHOR (own journal only), ROOT (any journal)
 */
export async function deleteJournalHandler(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Journal not found" });
    }

    const journal = await getJournalById(id);
    if (!journal) {
      return res.status(404).json({ message: "Journal not found" });
    }

    // Ownership check
    if (req.user.role !== "ROOT") {
      const authorIdStr = getAuthorIdStr(journal);
      if (authorIdStr !== req.user.id) {
        return res.status(403).json({
          message: "Forbidden: You do not have permission to delete this journal",
        });
      }
    }

    await deleteJournal(id);
    return res.status(200).json({ message: "Journal deleted successfully" });
  } catch (error) {
    console.error("Delete journal error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PATCH /api/journals/:id/publish
 * Publishes a journal. Idempotent if already published.
 * Allowed: AUTHOR (own journal only), ROOT (any journal)
 */
export async function publishJournalHandler(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Journal not found" });
    }

    const journal = await getJournalById(id);
    if (!journal) {
      return res.status(404).json({ message: "Journal not found" });
    }

    // Ownership check
    if (req.user.role !== "ROOT") {
      const authorIdStr = getAuthorIdStr(journal);
      if (authorIdStr !== req.user.id) {
        return res.status(403).json({
          message: "Forbidden: You do not have permission to publish this journal",
        });
      }
    }

    const published = await publishJournal(id);
    return res.status(200).json({
      message: "Journal published successfully",
      journal: published,
    });
  } catch (error) {
    console.error("Publish journal error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/journals
 * Public listing of published journals only.
 * The status filter is enforced at the database level.
 */
export async function getPublishedJournalsHandler(req, res) {
  try {
    const journals = await getPublishedJournals();
    return res.status(200).json({ journals });
  } catch (error) {
    console.error("Get published journals error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}
