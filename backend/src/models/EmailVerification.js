import mongoose from "mongoose";

const emailVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    otpHash: {
      type: String,
      required: [true, "OTP hash is required"],
      select: false,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    sendAttempts: {
      type: Number,
      default: 0,
    },
    sendWindowStartedAt: {
      type: Date,
      default: Date.now,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verificationTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    verificationTokenExpiresAt: {
      type: Date,
      default: null,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

emailVerificationSchema.index({ email: 1 }, { unique: true });
emailVerificationSchema.index({ otpExpiresAt: 1 });

const EmailVerification = mongoose.model(
  "EmailVerification",
  emailVerificationSchema
);

export default EmailVerification;
