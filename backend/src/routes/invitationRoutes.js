import express from "express";
import {
  sendOtpHandler,
  verifyOtpHandler,
  createInvitationHandler,
  getInvitationsHandler,
  revokeInvitationHandler,
  validateInvitationHandler,
  completeSetupHandler,
} from "../controllers/invitationController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

// Public invitation validation & acceptance endpoints
router.get("/validate", validateInvitationHandler);
router.post("/complete", completeSetupHandler);

// Protected ROOT and AUTHOR invitation endpoints (Unlimited author invitations)
router.post("/send-otp", authenticate, authorize("ROOT", "AUTHOR"), sendOtpHandler);
router.post("/verify-otp", authenticate, authorize("ROOT", "AUTHOR"), verifyOtpHandler);
router.post("/", authenticate, authorize("ROOT", "AUTHOR"), createInvitationHandler);
router.get("/", authenticate, authorize("ROOT", "AUTHOR"), getInvitationsHandler);
router.patch("/:id/revoke", authenticate, authorize("ROOT", "AUTHOR"), revokeInvitationHandler);
router.put("/:id/revoke", authenticate, authorize("ROOT", "AUTHOR"), revokeInvitationHandler);

export default router;
