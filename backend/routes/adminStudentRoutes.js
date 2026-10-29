const express = require("express");
const router = express.Router();
const Student = require("../models/Student");

// Protect this route with your existing admin authentication middleware.
router.get("/", async (req, res) => {
  try {
    const students = await Student.find({})
      .select("-passwordHash -profileImagePublicId")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: students.length,
      students
    });
  } catch (error) {
    console.error("Fetch students error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch students."
    });
  }
});

module.exports = router;