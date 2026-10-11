import mongoose from "mongoose";

const journalSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    abstract: {
      type: String,
      required: [true, "Abstract is required"],
      trim: true,
      maxlength: [2000, "Abstract cannot exceed 2000 characters"],
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      trim: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Author is required"],
    },
    domain: {
      type: String,
      required: [true, "Domain is required"],
      trim: true,
      maxlength: [100, "Domain cannot exceed 100 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["DRAFT", "PUBLISHED"],
        message: "Invalid status: {VALUE}",
      },
      default: "DRAFT",
      required: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common query patterns
journalSchema.index({ authorId: 1, updatedAt: -1 }); // My journals queries
journalSchema.index({ status: 1, publishedAt: -1 }); // Public published listing
journalSchema.index({ domain: 1 }); // Domain filtering

journalSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;

    const populatedAuthor = doc.populated("authorId") ? doc.authorId : null;
    if (populatedAuthor) {
      const authorId = populatedAuthor._id.toString();
      ret.author = {
        id: authorId,
        name: populatedAuthor.displayName || populatedAuthor.name,
      };
      ret.authorId = authorId;
    } else if (doc.authorId) {
      ret.authorId = doc.authorId.toString();
    }

    return ret;
  },
});

const Journal = mongoose.model("Journal", journalSchema);

export default Journal;
