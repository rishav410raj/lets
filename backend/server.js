require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const bcrypt = require("bcryptjs");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const Admin = require("./models/Admin");
const Student = require("./models/Student");
const Course = require("./models/Course");
const Admission = require("./models/Admission");

const {
  adminRouter: adminStudyMaterialRouter,
  studentRouter: studentStudyMaterialRouter
} = require("./routes/studyMaterialRoutes");
const studentRoutes = require("./routes/studentRoutes");

const {
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("./utils/imageUpload");

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from .env");
}

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing from .env");
}

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  throw new Error("Cloudinary credentials are missing from .env");
}

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  "https://letstalkbgp.com",
  "https://www.letstalkbgp.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "letstalk.admin.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "admin_sessions",
      ttl: 60 * 60 * 24 * 7,
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);
app.use("/api/student", studentRoutes);

// Study material routes
app.use("/api/study-materials", adminStudyMaterialRouter);
app.use("/api/student/study-materials", studentStudyMaterialRouter);
// -------------------- HELPERS --------------------

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({
      success: false,
      message: "Please login as admin first.",
    });
  }

  next();
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();

    req.session.destroy((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function clearAdminCookie(res) {
  res.clearCookie("letstalk.admin.sid", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
}

function publicAdmin(admin) {
  return {
    id: admin._id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    profilePhoto: admin.profilePhoto || "",
  };
}

async function verifyAdmin(req, res, next) {
  try {
    if (!req.session.adminId) {
      return res.status(401).json({
        success: false,
        message: "Please login first.",
      });
    }

    const admin = await Admin.findById(req.session.adminId);

    if (!admin) {
      await destroySession(req);
      clearAdminCookie(res);

      return res.status(401).json({
        success: false,
        message: "Admin account not found. Please login again.",
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

function validateCourse(body) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const duration = String(body.duration || "").trim();
  const fee = Number(body.fee);

  if (!title || !description || !duration) {
    return "Title, description and duration are required.";
  }

  if (
    title.length > 150 ||
    description.length > 3000 ||
    duration.length > 100
  ) {
    return "One or more course fields are too long.";
  }

  if (!Number.isFinite(fee) || fee < 0) {
    return "Course fee must be a valid non-negative number.";
  }

  return null;
}

function courseFields(body) {
  return {
    title: String(body.title).trim(),
    description: String(body.description).trim(),
    duration: String(body.duration).trim(),
    fee: Number(body.fee),
  };
}

// -------------------- BASIC ROUTES --------------------
// -------------------- FRONTEND STATIC FILES --------------------

// -------------------- FRONTEND STATIC FILES --------------------

// -------------------- FRONTEND STATIC FILES --------------------

const frontendPath = path.join(__dirname, "public");

if (!fs.existsSync(path.join(frontendPath, "index.html"))) {
  console.error("Frontend index.html not found:", frontendPath);
} else {
  console.log("Frontend directory found:", frontendPath);
}

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"), (error) => {
    if (error) {
      console.error("Frontend serving error:", error.message);

      if (!res.headersSent) {
        res.status(500).send("Unable to load website.");
      }
    }
  });
});

// -------------------- BASIC ROUTES --------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API is healthy.",
  });
});

app.get("/api/admin/setup-status", async (req, res, next) => {
  try {
    const adminExists = (await Admin.countDocuments()) > 0;

    res.json({
      success: true,
      adminExists,
      setupRequired: !adminExists,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/test-study-materials", (req, res) => {
  res.json({
    success: true,
    message: "Study materials API route is reachable",
  });
});

// -------------------- ADMIN SIGNUP --------------------

app.post("/api/admin/signup", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
      });
    }

    if ((await Admin.countDocuments()) > 0) {
      return res.status(403).json({
        success: false,
        message: "Admin setup is already complete.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await Admin.create({
      name,
      email,
      passwordHash,
      role: "admin",
    });

    await regenerateSession(req);
    req.session.adminId = String(admin._id);
    await saveSession(req);

    res.status(201).json({
      success: true,
      message: "Admin account created successfully.",
      admin: publicAdmin(admin),
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- ADMIN LOGIN --------------------

app.post("/api/admin/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const admin = await Admin.findOne({ email }).select("+passwordHash");

    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    await regenerateSession(req);
    req.session.adminId = String(admin._id);
    await saveSession(req);

    res.json({
      success: true,
      message: "Login successful.",
      admin: publicAdmin(admin),
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- CURRENT ADMIN --------------------

app.get("/api/admin/me", verifyAdmin, (req, res) => {
  res.json({
    success: true,
    admin: publicAdmin(req.admin),
  });
});

// -------------------- ADMIN PROFILE PHOTO --------------------

app.post(
  "/api/admin/profile-photo",
  verifyAdmin,
  upload.single("photo"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select a profile photo.",
        });
      }

      const result = await uploadToCloudinary(
        req.file.buffer,
        "letstalk-english/admins"
      );

      const oldPublicId = req.admin.profilePhotoPublicId;

      req.admin.profilePhoto = result.secure_url;
      req.admin.profilePhotoPublicId = result.public_id;

      await req.admin.save();

      if (oldPublicId) {
        deleteFromCloudinary(oldPublicId).catch((error) => {
          console.error("Old admin photo deletion failed:", error.message);
        });
      }

      res.json({
        success: true,
        message: "Profile photo updated successfully.",
        admin: publicAdmin(req.admin),
      });
    } catch (error) {
      next(error);
    }
  }
);

// -------------------- GET ALL STUDENTS --------------------

app.get("/api/admin/students", verifyAdmin, async (req, res, next) => {
  try {
    const students = await Student.find()
      .select("-passwordHash -profileImagePublicId")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      students,
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- GET SINGLE STUDENT --------------------

app.get("/api/admin/students/:id", verifyAdmin, async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id).select(
      "-passwordHash -profileImagePublicId"
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    res.json({
      success: true,
      student,
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- CREATE STUDENT --------------------

app.post("/api/admin/students", verifyAdmin, async (req, res, next) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const studentId = String(req.body.studentId || "").trim();
    const temporaryPassword = String(req.body.temporaryPassword || "");

    if (!fullName || !email || !studentId || !temporaryPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Full name, email, student ID and temporary password are required.",
      });
    }

    if (temporaryPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Temporary password must contain at least 8 characters.",
      });
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const student = await Student.create({
      fullName,
      email,
      studentId,
      passwordHash,
      registrationCompleted: false,
      isActive: true,
    });

    const result = student.toObject();
    delete result.passwordHash;
    delete result.profileImagePublicId;

    res.status(201).json({
      success: true,
      message: "Student created successfully.",
      student: result,
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- UPDATE STUDENT --------------------

app.put("/api/admin/students/:id", verifyAdmin, async (req, res, next) => {
  try {
    const allowedFields = [
      "fullName",
      "email",
      "phone",
      "dateOfBirth",
      "gender",
      "address",
      "qualification",
      "schoolCollege",
      "course",
      "city",
      "state",
      "pinCode",
      "session",
      "guardianName",
      "guardianPhone",
      "isActive",
      "registrationCompleted",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update.",
      });
    }

    const stringLimits = {
      fullName: 120,
      email: 254,
      phone: 30,
      gender: 30,
      address: 500,
      qualification: 150,
      schoolCollege: 200,
      course: 150,
      city: 100,
      state: 100,
      pinCode: 20,
      session: 100,
      guardianName: 120,
      guardianPhone: 30,
    };

    for (const [field, maxLength] of Object.entries(stringLimits)) {
      if (field in updates) {
        if (typeof updates[field] !== "string") {
          return res.status(400).json({
            success: false,
            message: `${field} must be text.`,
          });
        }

        updates[field] = updates[field].trim();

        if (updates[field].length > maxLength) {
          return res.status(400).json({
            success: false,
            message: `${field} is too long.`,
          });
        }
      }
    }

    if (updates.email) {
      updates.email = updates.email.toLowerCase();

      const emailExists = await Student.findOne({
        email: updates.email,
        _id: { $ne: req.params.id },
      });

      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: "This email is already registered.",
        });
      }
    }

    if (updates.gender && !["Male", "Female", "Other"].includes(updates.gender)) {
      return res.status(400).json({
        success: false,
        message: "Gender must be Male, Female or Other.",
      });
    }

    for (const field of ["isActive", "registrationCompleted"]) {
      if (field in updates && typeof updates[field] !== "boolean") {
        return res.status(400).json({
          success: false,
          message: `${field} must be true or false.`,
        });
      }
    }

    if (updates.dateOfBirth) {
      const date = new Date(updates.dateOfBirth);

      if (Number.isNaN(date.getTime()) || date > new Date()) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid date of birth.",
        });
      }

      updates.dateOfBirth = date;
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-passwordHash -profileImagePublicId");

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    res.json({
      success: true,
      message: "Student updated successfully.",
      student,
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- DELETE STUDENT --------------------

app.delete("/api/admin/students/:id", verifyAdmin, async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    if (student.profileImagePublicId) {
      deleteFromCloudinary(student.profileImagePublicId).catch((error) => {
        console.error("Student photo deletion failed:", error.message);
      });
    }

    await Student.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Student deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- STUDENT FEES --------------------

app.get(
  "/api/admin/students/:id/fees",
  verifyAdmin,
  async (req, res, next) => {
    try {
      const student = await Student.findById(req.params.id).select(
        "fullName studentId feeStructure"
      );

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found.",
        });
      }

      const feeStructure = student.feeStructure || {};
      const totalFee = Number(feeStructure.totalFee || 0);
      const paidAmount = Number(feeStructure.paidAmount || 0);

      res.json({
        success: true,
        fees: {
          totalFee,
          paidAmount,
          pendingFee: Math.max(0, totalFee - paidAmount),
          payments: feeStructure.payments || [],
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  "/api/admin/students/:id/fees",
  verifyAdmin,
  async (req, res, next) => {
    try {
      const totalFee = Number(req.body.totalFee);

      if (!Number.isFinite(totalFee) || totalFee < 0) {
        return res.status(400).json({
          success: false,
          message: "Total fee must be a valid non-negative number.",
        });
      }

      const student = await Student.findById(req.params.id);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found.",
        });
      }

      const feeStructure = student.feeStructure || {};
      const paidAmount = Number(feeStructure.paidAmount || 0);

      if (totalFee < paidAmount) {
        return res.status(400).json({
          success: false,
          message: "Total fee cannot be less than the amount already paid.",
        });
      }

      student.feeStructure = {
        ...feeStructure.toObject?.() || feeStructure,
        totalFee,
        paidAmount,
        payments: feeStructure.payments || [],
      };

      await student.save();

      res.json({
        success: true,
        message: "Fee updated successfully.",
        fees: student.feeStructure,
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/students/:id/fees/payments",
  verifyAdmin,
  async (req, res, next) => {
    try {
      const amount = Number(req.body.amount);
      const method = String(req.body.method || "").trim();
      const note = String(req.body.note || "").trim();
      const date = req.body.date ? new Date(req.body.date) : new Date();

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Payment amount must be greater than zero.",
        });
      }

      if (!method || method.length > 50 || note.length > 300) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid payment method and note.",
        });
      }

      if (Number.isNaN(date.getTime()) || date > new Date()) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid payment date.",
        });
      }

      const student = await Student.findById(req.params.id);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found.",
        });
      }

      const feeStructure = student.feeStructure || {};
      const totalFee = Number(feeStructure.totalFee || 0);
      const paidAmount = Number(feeStructure.paidAmount || 0);
      const pendingFee = Math.max(0, totalFee - paidAmount);

      if (amount > pendingFee) {
        return res.status(400).json({
          success: false,
          message: "Payment cannot exceed the pending fee.",
        });
      }

      feeStructure.payments = feeStructure.payments || [];
      feeStructure.payments.push({ amount, method, note, date });
      feeStructure.paidAmount = paidAmount + amount;

      student.feeStructure = feeStructure;
      await student.save();

      res.status(201).json({
        success: true,
        message: "Payment recorded successfully.",
        fees: student.feeStructure,
      });
    } catch (error) {
      next(error);
    }
  }
);

// -------------------- ADMISSIONS --------------------

app.get("/api/admin/admissions", verifyAdmin, async (req, res, next) => {
  try {
    const admissions = await Admission.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      admissions,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admissions", async (req, res, next) => {
  try {
    const admission = await Admission.create(req.body);

    res.status(201).json({
      success: true,
      message: "Admission submitted successfully.",
      admission,
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- COURSES --------------------

app.get("/api/courses", async (req, res, next) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      courses,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/courses", verifyAdmin, async (req, res, next) => {
  try {
    const errorMessage = validateCourse(req.body);

    if (errorMessage) {
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    const course = await Course.create(courseFields(req.body));

    res.status(201).json({
      success: true,
      message: "Course created successfully.",
      course,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/courses/:id", verifyAdmin, async (req, res, next) => {
  try {
    const errorMessage = validateCourse(req.body);

    if (errorMessage) {
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: courseFields(req.body) },
      { new: true, runValidators: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    res.json({
      success: true,
      message: "Course updated successfully.",
      course,
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/courses/:id", verifyAdmin, async (req, res, next) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    res.json({
      success: true,
      message: "Course deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- ADMIN CHANGE PASSWORD --------------------

app.post(
  "/api/admin/change-password",
  verifyAdmin,
  async (req, res, next) => {
    try {
      const currentPassword = String(req.body.currentPassword || "");
      const newPassword = String(req.body.newPassword || "");

      if (!currentPassword || newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message:
            "Current password is required and new password must contain at least 8 characters.",
        });
      }

      const admin = await Admin.findById(req.admin._id).select("+passwordHash");

      const matches = await bcrypt.compare(
        currentPassword,
        admin.passwordHash
      );

      if (!matches) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect.",
        });
      }

      admin.passwordHash = await bcrypt.hash(newPassword, 12);
      await admin.save();

      res.json({
        success: true,
        message: "Password changed successfully.",
      });
    } catch (error) {
      next(error);
    }
  }
);

// -------------------- DELETE ADMIN ACCOUNT --------------------

app.delete("/api/admin/delete-account", verifyAdmin, async (req, res, next) => {
  try {
    const password = String(req.body.password || "");

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required.",
      });
    }

    const admin = await Admin.findById(req.admin._id).select("+passwordHash");

    if (!(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password.",
      });
    }

    if (admin.profilePhotoPublicId) {
      deleteFromCloudinary(admin.profilePhotoPublicId).catch((error) => {
        console.error("Admin photo deletion failed:", error.message);
      });
    }

    await Admin.findByIdAndDelete(admin._id);
    await destroySession(req);
    clearAdminCookie(res);

    res.json({
      success: true,
      message: "Admin account deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- ADMIN LOGOUT --------------------

app.post("/api/admin/logout", async (req, res, next) => {
  try {
    await destroySession(req);
    clearAdminCookie(res);

    res.json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    next(error);
  }
});

// -------------------- ERROR HANDLING --------------------

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "Image size must be 5 MB or less.",
    });
  }

  if (error.message?.includes("Only JPG, PNG and WEBP")) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "This origin is not allowed.",
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "This email or ID is already registered.",
    });
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// -------------------- START SERVER --------------------

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await Admin.init();

    console.log("MongoDB connected successfully.");

    app.listen(PORT, () => {
      console.log(`Let's Talk English Class API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();