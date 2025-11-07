const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    employeeID: { type: String, required: true, unique: true },
    role: { type: String, enum: ['Admin', 'Employee'], default: 'Employee', required: true },
    designation: { type: String, enum: ['Developer', 'Designer', 'HR', 'Manager', 'Other'], required: true },
    salary: { type: Number, required: true, min: 0 },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    profileImage: { type: String, default: 'default_profile.png' },
    // Fields for Forgot Password
    resetToken: String,
    resetTokenExpiry: Date,
    // Paid Leave System
    paidLeavesAvailable: { type: Number, default: 0 }, // Total available paid leaves (can carryover)
    lastPaidLeaveReset: { type: Date }, // Last time paid leaves were reset/added
}, { timestamps: true });

// Hash the password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Method to compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);