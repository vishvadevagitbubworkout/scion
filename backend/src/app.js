import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import authRoutes from "./routes/authRoutes.js";
import journalRoutes from "./routes/journalRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import { authRequestLimit, invitationRequestLimit } from "./middleware/requestRateLimit.js";

const app = express();
const rawFrontendUrls = (
  process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",")
    : (process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"])
)
  .map((urlStr) => urlStr.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && rawFrontendUrls.length === 0) {
  throw new Error("Production FRONTEND_URL must be an explicit HTTPS origin");
}

const allowedOrigins = rawFrontendUrls.map((urlStr) => {
  const parsed = new URL(urlStr);
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("Production FRONTEND_URL must be an explicit HTTPS origin");
  }
  return parsed.origin;
});

app.use((req, res, next) => {
  res.set({
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Resource-Policy": "same-site",
  });
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "1mb", strict: true }));
app.use(cookieParser());

// Base endpoints
app.get("/", (req, res) => {
  res.json({
    message: "Scion API is running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

app.get("/ready", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
});

app.use("/api/auth", (req, res, next) => {
  if (["/login", "/register", "/password-reset/request", "/password-reset/complete"].includes(req.path)) {
    return authRequestLimit(req, res, next);
  }
  return next();
}, authRoutes);
app.use("/api/journals", journalRoutes);
app.use("/api/invitations", (req, res, next) => {
  if (["/send-otp", "/verify-otp", "/validate", "/complete"].includes(req.path)) {
    return invitationRequestLimit(req, res, next);
  }
  return next();
}, invitationRoutes);
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large" });
  }
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ message: "Invalid JSON request body" });
  }
  if (error.message === "Origin is not allowed by CORS") {
    return res.status(403).json({ message: "Origin is not allowed" });
  }
  console.error("Unhandled request error:", error.message);
  return res.status(500).json({ message: "Internal server error" });
});

export default app;