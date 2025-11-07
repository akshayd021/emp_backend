const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
    employee: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        index: true 
    },
    startDate: { 
        type: Date, 
        required: true 
    },
    endDate: { 
        type: Date, 
        required: true 
    },
    leaveType: { 
        type: String, 
        enum: ['Sick', 'Casual', 'Vacation', 'Personal', 'Other'], 
        required: true 
    },
    isPaidLeave: { 
        type: Boolean, 
        default: false 
    },
    reason: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['Pending', 'Approved', 'Rejected'], 
        default: 'Pending' 
    },
    adminResponse: { 
        type: String 
    },
    respondedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    respondedAt: { 
        type: Date 
    }
}, { timestamps: true });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);

