import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

// Route accessible by VIEWER, AUTHOR, and ROOT
router.get(
  "/viewer",
  authenticate,
  authorize("VIEWER", "AUTHOR", "ROOT"),
  (req, res) => {
    return res.status(200).json({
      message: "Viewer access granted",
      user: req.user,
    });
  }
);

// Route accessible by AUTHOR and ROOT
router.get(
  "/author",
  authenticate,
  authorize("AUTHOR", "ROOT"),
  (req, res) => {
    return res.status(200).json({
      message: "Author access granted",
      user: req.user,
    });
  }
);

// Route accessible by ROOT only
router.get(
  "/root",
  authenticate,
  authorize("ROOT"),
  (req, res) => {
    return res.status(200).json({
      message: "Root access granted",
      user: req.user,
    });
  }
);

export default router;
