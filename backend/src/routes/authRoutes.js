import express from "express";
import {
  register,
  login,
  logout,
  getCurrentUser,
  requestPasswordResetHandler,
  completePasswordResetHandler,
} from "../controllers/authController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/password-reset/request", requestPasswordResetHandler);
router.post("/password-reset/complete", completePasswordResetHandler);
router.post("/logout", logout);
router.get("/me", authenticate, getCurrentUser);

export default router;