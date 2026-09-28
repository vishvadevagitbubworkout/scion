import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import { hashPassword } from "../utils/password.js";

async function createRoot() {
  const rootName = process.env.ROOT_NAME;
  const rootEmail = process.env.ROOT_EMAIL;
  const rootPassword = process.env.ROOT_PASSWORD;
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error("Error: MONGODB_URI is required in environment variables.");
    process.exit(1);
  }

  if (!rootName || !rootEmail || !rootPassword) {
    console.error(
      "Error: ROOT_NAME, ROOT_EMAIL, and ROOT_PASSWORD must be configured in environment variables."
    );
    process.exit(1);
  }

  if (rootPassword.length < 8) {
    console.error("Error: ROOT_PASSWORD must be at least 8 characters long.");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB for ROOT creation.");

    const normalizedEmail = rootEmail.trim().toLowerCase();

    // Check if a ROOT account with this email or any ROOT account exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      if (existingUser.role === "ROOT") {
        console.log(
          `A ROOT user with email "${normalizedEmail}" already exists. No action taken.`
        );
      } else {
        console.log(
          `User with email "${normalizedEmail}" already exists with role "${existingUser.role}". Not overwriting.`
        );
      }
      await mongoose.disconnect();
      process.exit(0);
    }

    const passwordHash = await hashPassword(rootPassword);

    const rootUser = await User.create({
      name: rootName.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "ROOT",
      isActive: true,
    });

    console.log(`ROOT user successfully created with ID: ${rootUser._id}`);
    console.log(`ROOT Email: ${rootUser.email}`);
    console.log("Role: ROOT");
    console.log("Account is active.");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Failed to create ROOT user:", error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

createRoot();
