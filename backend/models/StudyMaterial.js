
const mongoose = require("mongoose");

const studyMaterialSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    course: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    fileUrl: {
      type: String,
      required: true
    },
    filePublicId: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      enum: ["pdf", "jpg", "jpeg"],
      required: true
    },
    originalFileName: {
      type: String,
      required: true,
      maxlength: 255
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudyMaterial", studyMaterialSchema);
