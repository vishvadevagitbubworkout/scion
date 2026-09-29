import express from "express";
import {
  createJournalHandler,
  getMyJournalsHandler,
  getJournalByIdHandler,
  updateJournalHandler,
  deleteJournalHandler,
  publishJournalHandler,
  getPublishedJournalsHandler,
} from "../controllers/journalController.js";
import { authenticate, optionalAuthenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

// GET /api/journals — public listing (published only, enforced at DB level)
router.get("/", getPublishedJournalsHandler);

// POST /api/journals — create journal (AUTHOR, ROOT only)
router.post("/", authenticate, authorize("AUTHOR", "ROOT"), createJournalHandler);

// GET /api/journals/my — owner's own journals (AUTHOR, ROOT only)
// IMPORTANT: defined before /:id so "my" is not treated as an ObjectId
router.get("/my", authenticate, authorize("AUTHOR", "ROOT"), getMyJournalsHandler);

// GET /api/journals/:id — mixed access
// Published: publicly accessible. Draft: owner or ROOT only.
router.get("/:id", optionalAuthenticate, getJournalByIdHandler);

// PUT /api/journals/:id — update journal (AUTHOR owner or ROOT)
router.put("/:id", authenticate, authorize("AUTHOR", "ROOT"), updateJournalHandler);

// DELETE /api/journals/:id — delete journal (AUTHOR owner or ROOT)
router.delete("/:id", authenticate, authorize("AUTHOR", "ROOT"), deleteJournalHandler);

// PATCH /api/journals/:id/publish — publish journal (AUTHOR owner or ROOT)
router.patch(
  "/:id/publish",
  authenticate,
  authorize("AUTHOR", "ROOT"),
  publishJournalHandler
);

export default router;
