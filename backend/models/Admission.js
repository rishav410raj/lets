
const mongoose = require("mongoose");

const admissionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    course: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        trim: true,
        default: ""
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("Admission", admissionSchema);
