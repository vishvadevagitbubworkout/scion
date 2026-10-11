import "dotenv/config";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import mongoose from "mongoose";

const PORT = Number(process.env.PORT || 5000);

async function startServer() {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  await connectDatabase();

  const server = app.listen(PORT, () => {
    console.log(`Scion backend running on http://localhost:${PORT}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received; shutting down`);
    server.close(async (error) => {
      if (error) {
        console.error("HTTP server shutdown failed");
        process.exitCode = 1;
      }
      await mongoose.disconnect();
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("Scion backend startup failed:", error.message);
  process.exitCode = 1;
});