import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import journalRoutes from "./routes/journalRoutes.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// Authentication, journal, and test routes
app.use("/api/auth", authRoutes);
app.use("/api/journals", journalRoutes);
app.use("/api/test", testRoutes);

export default app;