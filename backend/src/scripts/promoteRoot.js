import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { hashPassword } from '../utils/password.js';

const MONGODB_URI = process.env.MONGODB_URI;
const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;

async function promoteRoot() {
  try {
    if (!ROOT_EMAIL || !ROOT_PASSWORD) {
      console.error('ROOT_EMAIL or ROOT_PASSWORD not set in .env');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    const user = await User.findOne({ email: ROOT_EMAIL }).select('+passwordHash');
    
    if (!user) {
      console.error(`User with email ${ROOT_EMAIL} not found.`);
      process.exit(1);
    }

    console.log(`Found user: ${user.email}`);
    console.log(`Current role: ${user.role}`);
    console.log(`Current isActive: ${user.isActive}`);

    // Update password hash
    const newPasswordHash = await hashPassword(ROOT_PASSWORD);

    user.role = 'ROOT';
    user.passwordHash = newPasswordHash;
    user.isActive = true;

    await user.save();
    console.log(`\nSuccessfully promoted ${user.email} to ROOT.`);
    console.log('Password has been updated to the one in .env.');
    console.log(`Role is now ${user.role}.`);
    console.log(`isActive is now ${user.isActive}.`);

  } catch (error) {
    console.error('Error promoting root user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

promoteRoot();
