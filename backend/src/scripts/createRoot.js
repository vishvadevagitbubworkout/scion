import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import User from "../models/User.js";
import { hashPassword } from "../utils/password.js";

const ROOT_BOOTSTRAP_CONFIRMATION = "CREATE_INITIAL_ROOT";

export async function createInitialRoot({
  rootName,
  rootEmail,
  rootPassword,
  confirmation,
}) {
  const name = rootName?.trim();
  const email = rootEmail?.trim().toLowerCase();

  if (confirmation !== ROOT_BOOTSTRAP_CONFIRMATION) {
    throw new Error("ROOT_BOOTSTRAP_CONFIRM must equal CREATE_INITIAL_ROOT");
  }
  if (!name || !email || !rootPassword) {
    throw new Error("ROOT_NAME, ROOT_EMAIL, and ROOT_PASSWORD are required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ROOT_EMAIL must be a valid email address");
  }
  if (rootPassword.length < 12) {
    throw new Error("ROOT_PASSWORD must be at least 12 characters long");
  }
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB must be connected before ROOT bootstrap");
  }

  const state = mongoose.connection.collection("systemState");
  if (await User.exists({ role: "ROOT" })) {
    throw new Error("A ROOT account already exists; bootstrap is only for first-time setup");
  }
  if (await User.exists({ email })) {
    throw new Error("The configured ROOT_EMAIL already belongs to an account");
  }

  try {
    await state.insertOne({ _id: "root-bootstrap", createdAt: new Date() });
  } catch (error) {
    if (error.code === 11000) {
      throw new Error("ROOT bootstrap has already been claimed");
    }
    throw error;
  }

  try {
    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(rootPassword),
      role: "ROOT",
      isActive: true,
    });
    console.log("Initial ROOT account created");
    return user;
  } catch (error) {
    if (!(await User.exists({ role: "ROOT" }))) {
      await state.deleteOne({ _id: "root-bootstrap" });
    }
    throw error;
  }
}

async function runBootstrap() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await createInitialRoot({
      rootName: process.env.ROOT_NAME,
      rootEmail: process.env.ROOT_EMAIL,
      rootPassword: process.env.ROOT_PASSWORD,
      confirmation: process.env.ROOT_BOOTSTRAP_CONFIRM,
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBootstrap().catch(() => {
    console.error("ROOT bootstrap failed; check the selected database and bootstrap prerequisites privately");
    process.exitCode = 1;
  });
}
