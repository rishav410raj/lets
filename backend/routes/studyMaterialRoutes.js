
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const Admin = require("../models/Admin");
const Student = require("../models/Student");
const StudyMaterial = require("../models/StudyMaterial");

const adminRouter = express.Router();
const studentRouter = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024;

for (const key of [
  "MONGODB_URI",
  "STUDENT_SESSION_SECRET",
  "SESSION_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET"
]) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Student session
studentRouter.use(session({
  name: "letstalk.student.sid",
  secret: process.env.STUDENT_SESSION_SECRET,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "student_sessions",
    ttl: 86400
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 86400000
  }
}));

// PDF/JPG/JPEG upload validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter(req, file, callback) {
    const extension = (file.originalname || "")
      .split(".").pop().toLowerCase();

    const allowed =
      (extension === "pdf" && file.mimetype === "application/pdf") ||
      (["jpg", "jpeg"].includes(extension) &&
        file.mimetype === "image/jpeg");

    if (!allowed) {
      return callback(
        new Error("Only PDF, JPG and JPEG files are allowed.")
      );
    }

    callback(null, true);
  }
});

function handleUpload(req, res, next) {
  upload.single("file")(req, res, error => {
    if (!error) return next();

    const message = error instanceof multer.MulterError
      ? error.code === "LIMIT_FILE_SIZE"
        ? "File size must be 10 MB or less."
        : "Only one file can be uploaded at a time."
      : error.message || "Invalid upload.";

    res.status(400).json({ success: false, message });
  });
}

// Admin authentication uses the session from server.js.
async function requireAdmin(req, res, next) {
  try {
    if (!req.session?.adminId) {
      return res.status(401).json({
        success: false,
        message: "Please log in as admin."
      });
    }

    const admin = await Admin.findById(req.session.adminId).select("_id");

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Admin account not found. Please log in again."
      });
    }

    req.studyMaterialAdmin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

// Student authentication uses the student session.
async function requireStudent(req, res, next) {
  try {
    if (!req.session?.studentId) {
      return res.status(401).json({
        success: false,
        message: "Please log in with your student account."
      });
    }

    const student = await Student.findById(req.session.studentId)
      .select("_id");

    if (!student) {
      return res.status(401).json({
        success: false,
        message: "Student account not found. Please log in again."
      });
    }

    req.studyMaterialStudent = student;
    next();
  } catch (error) {
    next(error);
  }
}

// Validate required fields.
function validateMaterialFields(body) {
  const { title, subject, course, description } = body || {};

  if (typeof title !== "string" || !title.trim() ||
      title.trim().length > 150) {
    return "Title is required and must be 150 characters or fewer.";
  }

  if (typeof subject !== "string" || !subject.trim() ||
      subject.trim().length > 100) {
    return "Subject is required and must be 100 characters or fewer.";
  }

  if (typeof course !== "string" || !course.trim() ||
      course.trim().length > 120) {
    return "Course is required and must be 120 characters or fewer.";
  }

  if (description !== undefined &&
      (typeof description !== "string" || description.length > 1000)) {
    return "Description must be 1000 characters or fewer.";
  }

  return null;
}

// Upload file to Cloudinary.
function uploadToCloudinary(file, fileType) {
  return new Promise((resolve, reject) => {
    const resourceType = fileType === "pdf" ? "raw" : "image";

    const options = {
      folder: "lets-talk-english/study-materials",
      resource_type: resourceType,
      allowed_formats: fileType === "pdf" ? ["pdf"] : ["jpg", "jpeg"]
    };

    if (fileType === "pdf") {
      options.public_id = `${new mongoose.Types.ObjectId()}.pdf`;
    }

    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve({ ...result, resourceType });
      }
    );

    stream.end(file.buffer);
  });
}

async function deleteCloudinaryFile(material) {
  return cloudinary.uploader.destroy(material.filePublicId, {
    resource_type: material.fileType === "pdf" ? "raw" : "image",
    invalidate: true
  });
}

// ADMIN: List all materials.
adminRouter.get("/", requireAdmin, async (req, res, next) => {
  try {
    const materials = await StudyMaterial.find({})
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      total: materials.length,
      materials
    });
  } catch (error) {
    next(error);
  }
});

// ADMIN: Upload material.
adminRouter.post("/", requireAdmin, handleUpload, async (req, res, next) => {
  let uploadedFile = null;

  try {
    const validationError = validateMaterialFields(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a PDF or JPG file."
      });
    }

    const extension = req.file.originalname.split(".").pop().toLowerCase();
    const fileType = extension === "jpeg" ? "jpeg" : extension;

    uploadedFile = await uploadToCloudinary(req.file, fileType);

    const material = await StudyMaterial.create({
      title: req.body.title.trim(),
      subject: req.body.subject.trim(),
      course: req.body.course.trim(),
      description: (req.body.description || "").trim(),
      fileUrl: uploadedFile.secure_url,
      filePublicId: uploadedFile.public_id,
      fileType,
      originalFileName: req.file.originalname.slice(0, 255),
      uploadedBy: req.studyMaterialAdmin._id
    });

    res.status(201).json({
      success: true,
      message: "Study material uploaded successfully.",
      material
    });
  } catch (error) {
    if (uploadedFile) {
      await cloudinary.uploader.destroy(uploadedFile.public_id, {
        resource_type: uploadedFile.resourceType
      }).catch(cleanupError => {
        console.error("Cloudinary cleanup error:", cleanupError.message);
      });
    }

    next(error);
  }
});

// ADMIN: Delete material.
adminRouter.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study material ID."
      });
    }

    const material = await StudyMaterial.findById(req.params.id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Study material not found."
      });
    }

    await StudyMaterial.deleteOne({ _id: material._id });

    try {
      await deleteCloudinaryFile(material);
    } catch (error) {
      console.error("Cloudinary deletion error:", error.message);
    }

    res.json({
      success: true,
      message: "Study material deleted."
    });
  } catch (error) {
    next(error);
  }
});

// STUDENT: List materials.
studentRouter.get("/", requireStudent, async (req, res, next) => {
  try {
    const materials = await StudyMaterial.find({})
      .select("-filePublicId")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      total: materials.length,
      materials
    });
  } catch (error) {
    next(error);
  }
});

function routeErrorHandler(error, req, res, next) {
  console.error("Study material route error:", error.message);

  if (res.headersSent) return next(error);

  res.status(500).json({
    success: false,
    message: "A study material server error occurred."
  });
}

adminRouter.use(routeErrorHandler);
studentRouter.use(routeErrorHandler);

module.exports = {
  adminRouter,
  studentRouter
};
