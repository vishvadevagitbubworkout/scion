import 'dotenv/config';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import User from '../models/User.js';
import { verifyPassword } from '../utils/password.js';

export async function verifyRootAccount({ rootEmail, rootPassword }) {
  const normalizedEmail = rootEmail?.trim().toLowerCase();
  if (!normalizedEmail || !rootPassword) {
    throw new Error("ROOT_EMAIL and ROOT_PASSWORD are required");
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  if (!user) return false;
  return user.role === 'ROOT'
    && user.isActive === true
    && await verifyPassword(rootPassword, user.passwordHash);
}

const MONGODB_URI = process.env.MONGODB_URI;
const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;

async function verifyRoot() {
  try {
    if (!MONGODB_URI || !ROOT_EMAIL || !ROOT_PASSWORD) {
      throw new Error("MONGODB_URI, ROOT_EMAIL, and ROOT_PASSWORD must be configured privately");
    }
    await mongoose.connect(MONGODB_URI);
    const verified = await verifyRootAccount({
      rootEmail: ROOT_EMAIL,
      rootPassword: ROOT_PASSWORD,
    });
    console.log(`ROOT verification: ${verified ? "PASS" : "FAIL"}`);
    if (!verified) process.exitCode = 1;
  } catch {
    console.error("ROOT verification could not be completed");
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyRoot();
}
