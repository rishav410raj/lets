
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    paymentDate: {
      type: Date,
      default: Date.now,
      required: true
    },
    method: {
      type: String,
      enum: ["Cash", "UPI", "Bank Transfer", "Card", "Other"],
      default: "Cash"
    },
    note: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    }
  },
  { timestamps: true }
);

const studentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    registrationCompleted: {
      type: Boolean,
      default: false
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: ""
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
      default: "Prefer not to say"
    },
    address: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ""
    },
    qualification: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },
    schoolCollege: {
      type: String,
      trim: true,
      maxlength: 150,
      default: ""
    },
    course: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ""
    },
    profileImage: {
      type: String,
      default: ""
    },
    profileImagePublicId: {
      type: String,
      default: ""
    },
    city: {
      type: String,
      trim: true,
      maxlength: 80,
      default: ""
    },
    state: {
      type: String,
      trim: true,
      maxlength: 80,
      default: ""
    },
    pinCode: {
      type: String,
      trim: true,
      maxlength: 6,
      default: ""
    },
    session: {
      type: String,
      trim: true,
      maxlength: 20,
      default: ""
    },
    guardianName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },
    guardianPhone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: ""
    },
    feeStructure: {
      totalFee: {
        type: Number,
        default: 0,
        min: 0
      },
      paidAmount: {
        type: Number,
        default: 0,
        min: 0
      },
      payments: {
        type: [paymentSchema],
        default: []
      }
    }
  },
  { timestamps: true }
);

studentSchema.virtual("pendingFee").get(function () {
  return Math.max(
    0,
    this.feeStructure.totalFee - this.feeStructure.paidAmount
  );
});

studentSchema.set("toJSON", { virtuals: true });
studentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Student", studentSchema);
