
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const bcrypt = require("bcryptjs");
const Student = require("../models/Student");

const {
  upload,
  uploadToCloudinary,
  deleteFromCloudinary
} = require("../utils/imageUpload");

const router = express.Router();

const SESSION_SECRET = process.env.STUDENT_SESSION_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

if (!SESSION_SECRET || !MONGODB_URI) {
  throw new Error("STUDENT_SESSION_SECRET and MONGODB_URI are required.");
}

router.use(
  session({
    name: "letstalk.student.sid",
    secret: SESSION_SECRET,
    store: MongoStore.create({
      mongoUrl: MONGODB_URI,
      collectionName: "student_sessions",
      ttl: 7 * 24 * 60 * 60
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error =>
      error ? reject(error) : resolve()
    );
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save(error =>
      error ? reject(error) : resolve()
    );
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();

    req.session.destroy(error =>
      error ? reject(error) : resolve()
    );
  });
}

function clearStudentCookie(res) {
  res.clearCookie("letstalk.student.sid", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  });
}

function requireStudent(req, res, next) {
  if (!req.session?.studentId) {
    return res.status(401).json({
      success: false,
      message: "Please log in as a student."
    });
  }

  next();
}

function publicStudent(student) {
  const totalFee = Number(student.feeStructure?.totalFee || 0);
  const paidAmount = Number(student.feeStructure?.paidAmount || 0);

  return {
    id: student._id,
    fullName: student.fullName,
    studentId: student.studentId,
    email: student.email,
    isActive: student.isActive,
    phone: student.phone,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    address: student.address,
    qualification: student.qualification,
    schoolCollege: student.schoolCollege,
    course: student.course,
    profileImage: student.profileImage,
    city: student.city,
    state: student.state,
    pinCode: student.pinCode,
    session: student.session,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    registrationCompleted: student.registrationCompleted,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    feeStructure: {
      totalFee,
      paidAmount,
      pendingFee: Math.max(0, totalFee - paidAmount),
      payments: (student.feeStructure?.payments || []).map(payment => ({
        id: payment._id,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        method: payment.method,
        note: payment.note
      }))
    }
  };
}

function textField(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function registrationPayload(body) {
  return {
    fullName: textField(body.fullName, 100),
    email: textField(body.email, 254).toLowerCase(),
    phone: textField(body.phone, 20),
    gender: textField(body.gender, 30) || "Prefer not to say",
    address: textField(body.address, 300),
    qualification: textField(body.qualification, 100),
    schoolCollege: textField(body.schoolCollege, 150),
    course: textField(body.course, 120),
    city: textField(body.city, 80),
    state: textField(body.state, 80),
    pinCode: textField(body.pinCode, 6),
    session: textField(body.session, 20),
    guardianName: textField(body.guardianName, 100),
    guardianPhone: textField(body.guardianPhone, 20)
  };
}

router.post("/register", (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Please use the Login ID supplied by your administrator."
  });
});

router.post("/login", async (req, res) => {
  try {
    const { studentId, password } = req.body || {};

    if (
      typeof studentId !== "string" ||
      typeof password !== "string" ||
      !studentId.trim() ||
      !password ||
      password.length > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter your Student Login ID and password."
      });
    }

    const student = await Student.findOne({
      studentId: studentId.trim().toUpperCase(),
      isActive: { $ne: false }
    }).select("+passwordHash");

    if (!student || !(await bcrypt.compare(password, student.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "Invalid Login ID or password."
      });
    }

    await regenerateSession(req);
    req.session.studentId = student._id.toString();
    await saveSession(req);

    return res.json({
      success: true,
      message: "Login successful.",
      student: publicStudent(student),
      redirectTo: student.registrationCompleted
        ? "student-dashboard.html"
        : "student-registration.html"
    });
  } catch (error) {
    console.error("Student login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log in. Please try again."
    });
  }
});

router.post("/complete-registration", requireStudent, async (req, res) => {
  try {
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      address,
      city,
      state,
      pinCode,
      qualification,
      schoolCollege,
      course,
      session,
      guardianName,
      guardianPhone
    } = req.body;

    const student = await Student.findById(req.session.studentId);

    if (!student || !student.isActive) {
      return res.status(401).json({
        success: false,
        message: "Student account not found or inactive."
      });
    }

    if (student.registrationCompleted) {
      return res.status(400).json({
        success: false,
        message: "Registration is already completed."
      });
    }

    if (
      !fullName ||
      !dateOfBirth ||
      !gender ||
      !phone ||
      !address ||
      !city ||
      !state ||
      !pinCode ||
      !qualification ||
      !schoolCollege ||
      !course ||
      !session ||
      !guardianName ||
      !guardianPhone
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields."
      });
    }

    student.fullName = fullName.trim();
    student.dateOfBirth = new Date(dateOfBirth);
    student.gender = gender;
    student.phone = phone.trim();
    student.address = address.trim();
    student.city = city.trim();
    student.state = state.trim();
    student.pinCode = pinCode.trim();
    student.qualification = qualification.trim();
    student.schoolCollege = schoolCollege.trim();
    student.course = course.trim();
    student.session = session.trim();
    student.guardianName = guardianName.trim();
    student.guardianPhone = guardianPhone.trim();
    student.registrationCompleted = true;

    await student.save();

    return res.json({
      success: true,
      message: "Profile saved successfully.",
      student: {
        id: student._id,
        fullName: student.fullName,
        email: student.email,
        profileImage: student.profileImage || ""
      }
    });
  } catch (error) {
    console.error("Complete registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save profile."
    });
  }
});

router.get("/me", requireStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.session.studentId);

    if (!student || student.isActive === false) {
      await destroySession(req);
      clearStudentCookie(res);

      return res.status(401).json({
        success: false,
        message: "Your account is unavailable. Please contact the administrator."
      });
    }

    return res.json({
      success: true,
      student: publicStudent(student)
    });
  } catch (error) {
    console.error("Student profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load your student profile."
    });
  }
});

router.post(
  "/profile-photo",
  requireStudent,
  (req, res, next) => {
    upload.single("photo")(req, res, error => {
      if (!error) return next();

      return res.status(400).json({
        success: false,
        message: error.message || "Invalid image upload."
      });
    });
  },
  async (req, res) => {
    let uploadedImage;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select a JPG, PNG or WEBP photo."
        });
      }

      const student = await Student.findById(req.session.studentId);

      if (!student || student.isActive === false) {
        return res.status(401).json({
          success: false,
          message: "Student account not found."
        });
      }

      uploadedImage = await uploadToCloudinary(
        req.file.buffer,
        "letstalk-english/students"
      );

      const oldPublicId = student.profileImagePublicId;

      student.profileImage = uploadedImage.secure_url;
      student.profileImagePublicId = uploadedImage.public_id;

      await student.save();

      if (oldPublicId && oldPublicId !== uploadedImage.public_id) {
        deleteFromCloudinary(oldPublicId).catch(error => {
          console.error("Old student photo cleanup failed:", error.message);
        });
      }

      return res.json({
        success: true,
        message: "Profile photo updated successfully.",
        profileImage: student.profileImage,
        student: publicStudent(student)
      });
    } catch (error) {
      console.error("Student photo upload error:", error.message);

      if (uploadedImage?.public_id) {
        deleteFromCloudinary(uploadedImage.public_id).catch(() => {});
      }

      return res.status(500).json({
        success: false,
        message: "Could not upload profile photo."
      });
    }
  }
);

router.put("/me", requireStudent, (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Profile changes must be requested from the administrator."
  });
});

router.delete("/delete-account", (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Contact the administrator for account-related requests."
  });
});

router.post("/change-password", (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Please contact the administrator for password assistance."
  });
});

router.post("/logout", requireStudent, async (req, res) => {
  try {
    await destroySession(req);
    clearStudentCookie(res);

    return res.json({
      success: true,
      message: "Logged out successfully."
    });
  } catch (error) {
    console.error("Student logout error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log out."
    });
  }
});

module.exports = router;
