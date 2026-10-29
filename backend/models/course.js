const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    duration: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },
    fee: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);