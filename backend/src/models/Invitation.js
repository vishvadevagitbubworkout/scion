import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Invitee email is required"],
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    role: {
      type: String,
      enum: {
        values: ["AUTHOR"],
        message: "Invalid invitation role: {VALUE}",
      },
      default: "AUTHOR",
      required: true,
      immutable: true,
    },
    tokenHash: {
      type: String,
      required: [true, "Invitation token hash is required"],
      unique: true,
      select: false,
    },
    otpHash: {
      type: String,
      default: null,
      select: false,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    setupTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    setupTokenExpiresAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ["PENDING", "PROCESSING", "ACCEPTED", "REVOKED", "EXPIRED"],
        message: "Invalid invitation status: {VALUE}",
      },
      default: "PENDING",
      required: true,
    },
    processingLockedAt: {
      type: Date,
      default: null,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Invited by User reference is required"],
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required"],
    },
    usedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
invitationSchema.index({ email: 1, status: 1 });
invitationSchema.index({ expiresAt: 1 });

invitationSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.tokenHash;
    delete ret.otpHash;
    delete ret.setupTokenHash;
    delete ret.processingLockedAt;
    if (ret.invitedBy && ret.invitedBy._id) {
      ret.invitedBy = {
        id: ret.invitedBy._id.toString(),
        name: ret.invitedBy.name,
        email: ret.invitedBy.email,
      };
    } else if (ret.invitedBy) {
      ret.invitedBy = ret.invitedBy.toString();
    }
    return ret;
  },
});

const Invitation = mongoose.model("Invitation", invitationSchema);

export default Invitation;
