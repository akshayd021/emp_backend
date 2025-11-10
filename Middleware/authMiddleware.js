const jwt = require('jsonwebtoken');
const User = require('../models/UserModel.js');

const JWT_SECRET = process.env.JWT_SECRET || 'YO0123456789ABCDEF';

const verifyUser = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, JWT_SECRET);

            req.user = await User.findById(decoded._id).select('-password');

            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
            }

            next();
        } catch (error) {
            console.error('Token verification error:', error.message);
            return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Access denied: Admin role required' });
    }
};

const employeeOnly = (req, res, next) => {
    if (req.user && req.user.role === 'Employee') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Access denied: Employee role required' });
    }
};

module.exports = { verifyUser, adminOnly, employeeOnly };