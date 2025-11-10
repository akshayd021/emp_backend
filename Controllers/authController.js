
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const UserModel = require('../models/UserModel.js');

const JWT_SECRET = process.env.JWT_SECRET || 'YO0123456789ABCDEF';
const SMTP_USER = 'utsavvasoya99@gmail.com';
const SMTP_PASS = 'uptdpvaxaavevvbp';


const generateToken = (id, role) => {
    return jwt.sign({ _id: id, role: role }, JWT_SECRET, { expiresIn: '20d' });
};

const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await UserModel.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            const token = generateToken(user._id, user.role);
            res.status(200).json({
                success: true,
                token,
                user: {
                    _id: user._id,
                    name: user.name,
                    role: user.role,
                    designation: user.designation,
                    profileImage: user.profileImage,
                },
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
};

// @desc    Get user profile and verify token validity
// @route   GET /api/auth/verify (Protected by verifyUser)
const verify = async (req, res) => {
    try {
        // req.user is set by verifyUser middleware
        res.status(200).json({
            success: true,
            message: "Token is valid",
            user: req.user,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// @desc    Change password (for logged-in user)
// @route   PUT /api/auth/change-password (Protected by verifyUser)
const changePassword = async (req, res) => {
    const userId = req.user._id; // ID comes from the authenticated token
    const { currentPassword, newPassword } = req.body;

    try {
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check current password
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Current password is incorrect" });
        }

        // Hash and save new password (Mongoose pre-save hook handles hashing if we set the field)
        user.password = newPassword;
        await user.save(); // Pre-save hook will hash newPassword

        return res.status(200).json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        console.error("Password change error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// @desc    Forgot Password - Send reset link
// @route   POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await UserModel.findOne({ email });
        if (!user) {
            // Send 200 OK even if user is not found to prevent email enumeration
            return res.status(200).json({ success: true, message: "If a user exists, a password reset link has been sent." });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");

        // Frontend URL where the user will reset the password
        const resetLink = `https://employee-frontend-i28v.onrender.com/reset-password/${resetToken}`;

        user.resetToken = resetToken;
        user.resetTokenExpiry = Date.now() + 3600000; // 1 hour expiry
        await user.save({ validateBeforeSave: false }); // Skip password validation on save

        // Setup Nodemailer
        const transporter = nodemailer.createTransport({
            service: "Gmail",
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
        });

        const mailOptions = {
            from: SMTP_USER,
            to: user.email,
            subject: "Password Reset Request",
            html: `
                <h2>Password Reset</h2>
                <p>You requested a password reset. Click the button below to reset your password. This link will expire in 1 hour.</p>
                <a href="${resetLink}" style="background: #10b981; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
                    Reset Password
                </a>
                <p>If the button doesn't work, click or copy this link: <br />
                <a href="${resetLink}">${resetLink}</a></p>
            `,
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({ success: true, message: "Reset link sent to your email." });
    } catch (error) {
        console.error("Forgot Password Error:", error);
        return res.status(500).json({ success: false, message: "Server error while sending email." });
    }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password/:token
const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
        }

        const user = await UserModel.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid or expired token" });
        }

        // Use the pre-save hook to hash and save
        user.password = newPassword;
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();

        return res.status(200).json({ success: true, message: "Password reset successful. You can now login." });
    } catch (err) {
        console.error("Reset Password Error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = {
    login,
    verify,
    changePassword,
    forgotPassword,
    resetPassword,
};