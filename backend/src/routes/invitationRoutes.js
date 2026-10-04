import express from "express";
import {
  createInvitationHandler,
  getInvitationsHandler,
  revokeInvitationHandler,
  validateInvitationHandler,
  verifyOtpHandler,
  completeSetupHandler,
} from "../controllers/invitationController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

// Public invitation validation & acceptance endpoints
router.get("/validate", validateInvitationHandler);
router.post("/verify-otp", verifyOtpHandler);
router.post("/complete", completeSetupHandler);

// Protected ROOT management endpoints
router.post("/", authenticate, authorize("ROOT"), createInvitationHandler);
router.get("/", authenticate, authorize("ROOT"), getInvitationsHandler);
router.patch("/:id/revoke", authenticate, authorize("ROOT"), revokeInvitationHandler);

export default router;
