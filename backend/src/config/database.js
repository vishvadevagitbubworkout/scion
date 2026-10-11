import mongoose from "mongoose";

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed");
    throw new Error("Database connection failed", { cause: error });
  }
}