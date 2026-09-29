import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { verifyPassword } from '../utils/password.js';

const MONGODB_URI = process.env.MONGODB_URI;
const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;

async function verifyRoot() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('--- Verification Test ---');

    const user = await User.findOne({ email: ROOT_EMAIL }).select('+passwordHash');
    
    if (!user) {
      console.log('Result: FAIL - User not found.');
      process.exit(1);
    }
    
    console.log(`User exists: YES (${user.email})`);
    console.log(`Role is ROOT: ${user.role === 'ROOT' ? 'YES' : 'NO (' + user.role + ')'}`);
    console.log(`isActive is true: ${user.isActive === true ? 'YES' : 'NO'}`);

    const isPasswordValid = await verifyPassword(ROOT_PASSWORD, user.passwordHash);
    console.log(`Password authenticates successfully: ${isPasswordValid ? 'YES' : 'NO'}`);

  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    await mongoose.disconnect();
  }
}

verifyRoot();
