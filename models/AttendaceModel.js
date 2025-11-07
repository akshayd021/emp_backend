const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    employee: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        index: true 
    },
    date: { 
        type: Date, 
        required: true, 
        default: () => new Date().setHours(0, 0, 0, 0), // Set to start of the day
        index: true
    },
    // Advanced Time Tracking
    punchIn: { type: Date }, 
    lunchStart: { type: Date },
    lunchEnd: { type: Date },
    punchOut: { type: Date },
    
    // Calculated fields
    totalBreakDurationMinutes: { type: Number, default: 0 }, // Time spent in lunch/breaks
    totalWorkDurationMinutes: { type: Number, default: 0 }, // Total time between punch in/out - break
    
    // Status can be set by Admin (Leave) or calculated (Present/Absent)
    status: { 
        type: String, 
        enum: ['Present', 'Absent', 'Leave', 'Half Day'], 
        default: 'Absent' 
    },
    leaveType: { type: String }, // e.g., 'Sick', 'Casual', 'Vacation'
}, { timestamps: true });

// Ensure unique attendance per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);