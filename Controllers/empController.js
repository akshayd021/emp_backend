const AttendaceModel = require("../models/AttendaceModel");
const ProjectModel = require("../models/ProjectModel");
const UserModel = require("../models/UserModel");
const LeaveRequestModel = require("../models/LeaveRequestModel");
const { sendLeaveRequestEmail } = require("../utils/emailService");


// Helper to get start of today
const getStartOfToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

// Helper to calculate duration in minutes
const calculateDurationInMinutes = (start, end) => {
    if (!start || !end) return 0;
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60));
};

// @desc    Get Employee Profile (Salary, DOB, Role, etc.)
// @route   GET /api/employee/profile
const getEmployeeProfile = async (req, res) => {
    // req.user is set by verifyUser middleware (already has non-sensitive data)
    try {
        const user = await UserModel.findById(req.user._id).select('name email employeeID role designation salary dob gender profileImage');
        if (!user) {
            return res.status(404).json({ success: false, message: "Employee profile not found." });
        }
        res.status(200).json({ success: true, profile: user });
    } catch (error) {
        console.error("Get Profile Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching profile.' });
    }
};

// @desc    Employee Punch In
// @route   POST /api/employee/attendance/check-in
const punchIn = async (req, res) => {
    const employeeId = req.user._id;
    const today = getStartOfToday();

    try {
        let attendance = await AttendaceModel.findOne({ employee: employeeId, date: today });

        if (attendance && attendance.punchIn) {
            return res.status(400).json({ success: false, message: "You have already punched in today." });
        }

        if (!attendance) {
            attendance = await AttendaceModel.create({
                employee: employeeId,
                date: today,
                punchIn: new Date(),
                status: 'Present',
                totalBreakDurationMinutes: 0,
                totalWorkDurationMinutes: 0
            });
        } else {
            // Case where employee was marked Absent and is now checking in
            attendance.punchIn = new Date();
            attendance.status = 'Present';
            await attendance.save();
        }

        res.status(200).json({ success: true, message: "Punch In recorded successfully.", punchInTime: attendance.punchIn });
    } catch (error) {
        console.error("Punch In Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error during punch in.' });
    }
};

// @desc    Employee Lunch Start
// @route   POST /api/employee/attendance/lunch-start
const lunchStart = async (req, res) => {
    const employeeId = req.user._id;
    const today = getStartOfToday();

    try {
        const attendance = await AttendaceModel.findOne({ employee: employeeId, date: today });

        if (!attendance || !attendance.punchIn) {
            return res.status(400).json({ success: false, message: "Please punch in before starting lunch." });
        }
        if (attendance.lunchStart) {
            return res.status(400).json({ success: false, message: "Lunch break already started." });
        }

        attendance.lunchStart = new Date();
        await attendance.save();

        res.status(200).json({ success: true, message: "Lunch started.", lunchStartTime: attendance.lunchStart });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error starting lunch.' });
    }
};

// @desc    Employee Lunch End
// @route   POST /api/employee/attendance/lunch-end
const lunchEnd = async (req, res) => {
    const employeeId = req.user._id;
    const today = getStartOfToday();

    try {
        const attendance = await AttendaceModel.findOne({ employee: employeeId, date: today });

        if (!attendance || !attendance.lunchStart) {
            return res.status(400).json({ success: false, message: "Lunch break was not started." });
        }
        if (attendance.lunchEnd) {
            return res.status(400).json({ success: false, message: "Lunch break already ended." });
        }

        attendance.lunchEnd = new Date();

        // Calculate break duration
        const currentBreak = calculateDurationInMinutes(attendance.lunchStart, attendance.lunchEnd);
        attendance.totalBreakDurationMinutes += currentBreak;

        await attendance.save();

        res.status(200).json({ success: true, message: "Lunch ended. Break time added.", lunchEndTime: attendance.lunchEnd });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error ending lunch.' });
    }
};


// @desc    Employee Punch Out
// @route   POST /api/employee/attendance/check-out
const punchOut = async (req, res) => {
    const employeeId = req.user._id;
    const today = getStartOfToday();

    try {
        const attendance = await AttendaceModel.findOne({ employee: employeeId, date: today });

        if (!attendance || !attendance.punchIn) {
            return res.status(400).json({ success: false, message: "You must punch in before punching out." });
        }
        if (attendance.punchOut) {
            return res.status(400).json({ success: false, message: "You have already punched out today." });
        }
        // Handle case where lunch was started but not ended
        if (attendance.lunchStart && !attendance.lunchEnd) {
            attendance.lunchEnd = new Date();
            const lastBreak = calculateDurationInMinutes(attendance.lunchStart, attendance.lunchEnd);
            attendance.totalBreakDurationMinutes += lastBreak;
        }

        attendance.punchOut = new Date();

        // Calculate total time between punchIn and punchOut
        const totalMinutes = calculateDurationInMinutes(attendance.punchIn, attendance.punchOut);

        // Calculate total work duration
        attendance.totalWorkDurationMinutes = totalMinutes - attendance.totalBreakDurationMinutes;

        // Simple logic for Half Day (e.g., worked less than 4 hours)
        if (attendance.totalWorkDurationMinutes > 0 && attendance.totalWorkDurationMinutes < 240) {
            attendance.status = 'Half Day';
        } else {
            attendance.status = 'Present';
        }

        await attendance.save();

        res.status(200).json({
            success: true,
            message: "Punch Out recorded successfully.",
            punchOutTime: attendance.punchOut,
            totalWork: `${Math.floor(attendance.totalWorkDurationMinutes / 60)}h ${attendance.totalWorkDurationMinutes % 60}m`
        });
    } catch (error) {
        console.error("Punch Out Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error during punch out.' });
    }
};

// @desc    Get personal attendance history
// @route   GET /api/employee/attendance/history
const getAttendanceHistory = async (req, res) => {
    const employeeId = req.user._id;

    try {
        const history = await AttendaceModel.find({ employee: employeeId })
            .sort({ date: -1 })
            .limit(30) // Show last 30 days
            .select('date status punchIn punchOut totalWorkDurationMinutes totalBreakDurationMinutes');

        res.status(200).json({ success: true, history });
    } catch (error) {
        console.error("Attendance History Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching attendance history.' });
    }
};

// @desc    Get employee's assigned projects
// @route   GET /api/employee/projects
const getMyProjects = async (req, res) => {
    const employeeId = req.user._id;

    try {
        const projects = await ProjectModel.find({ employees: employeeId }).select('name description status dueDate');

        res.status(200).json({ success: true, projects });
    } catch (error) {
        console.error("My Projects Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching your projects.' });
    }
};

// @desc    Get today's attendance record
// @route   GET /api/employee/attendance/today
const getTodayAttendance = async (req, res) => {
    const employeeId = req.user._id;
    const today = getStartOfToday();

    try {
        const attendance = await AttendaceModel.findOne({ employee: employeeId, date: today });
        res.status(200).json({ success: true, attendance: attendance || null });
    } catch (error) {
        console.error("Get Today Attendance Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching today\'s attendance.' });
    }
};

// @desc    Request leave
// @route   POST /api/employee/leave/request
const requestLeave = async (req, res) => {
    const employeeId = req.user._id;
    const { startDate, endDate, leaveType, reason, usePaidLeave } = req.body;

    if (!startDate || !endDate || !leaveType || !reason) {
        return res.status(400).json({ success: false, message: "Please fill all required fields." });
    }

    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (start > end) {
            return res.status(400).json({ success: false, message: "Start date must be before or equal to end date." });
        }

        // Date restrictions: Vacation/Leave need 10 days notice, Sick/Other need 1 day notice
        const daysUntilStart = Math.ceil((start - today) / (1000 * 60 * 60 * 24));

        if (leaveType === 'Vacation' || leaveType === 'Personal') {
            if (daysUntilStart < 10) {
                return res.status(400).json({
                    success: false,
                    message: "Vacation and Personal leave requests must be submitted at least 10 days in advance."
                });
            }
        } else {
            if (daysUntilStart < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Leave requests must be submitted at least 1 day in advance."
                });
            }
        }

        // Check paid leave availability
        const employee = await UserModel.findById(employeeId);
        let isPaidLeave = false;

        if (usePaidLeave && employee.paidLeavesAvailable > 0) {
            const leaveDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            if (leaveDays <= employee.paidLeavesAvailable) {
                isPaidLeave = true;
            } else {
                return res.status(400).json({
                    success: false,
                    message: `You only have ${employee.paidLeavesAvailable} paid leave(s) available. Requested days: ${leaveDays}`
                });
            }
        }

        const leaveRequest = await LeaveRequestModel.create({
            employee: employeeId,
            startDate: start,
            endDate: end,
            leaveType,
            reason,
            isPaidLeave,
            status: 'Pending'
        });

        // Send email to admins
        const admins = await UserModel.find({ role: 'Admin' }).select('email');
        const adminEmails = admins.map(admin => admin.email);
        await sendLeaveRequestEmail(
            await LeaveRequestModel.findById(leaveRequest._id).populate('employee', 'name employeeID'),
            adminEmails
        );

        res.status(201).json({ success: true, message: "Leave request submitted successfully.", leaveRequest });
    } catch (error) {
        console.error("Request Leave Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error submitting leave request.' });
    }
};

// @desc    Get employee's leave requests
// @route   GET /api/employee/leave/requests
const getMyLeaveRequests = async (req, res) => {
    const employeeId = req.user._id;

    try {
        const leaveRequests = await LeaveRequestModel.find({ employee: employeeId })
            .sort({ createdAt: -1 })
            .populate('respondedBy', 'name');

        res.status(200).json({ success: true, leaveRequests });
    } catch (error) {
        console.error("Get Leave Requests Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching leave requests.' });
    }
};

// @desc    Get employee's paid leaves available
// @route   GET /api/employee/paid-leaves
const getMyPaidLeaves = async (req, res) => {
    const employeeId = req.user._id;

    try {
        const employee = await UserModel.findById(employeeId).select('paidLeavesAvailable lastPaidLeaveReset');
        res.status(200).json({
            success: true,
            paidLeavesAvailable: employee.paidLeavesAvailable || 0,
            lastReset: employee.lastPaidLeaveReset
        });
    } catch (error) {
        console.error("Get Paid Leaves Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching paid leaves.' });
    }
};

// @desc    Get employee's monthly salary breakdown
// @route   GET /api/employee/salary
const getMySalary = async (req, res) => {
    const employeeId = req.user._id;
    const { month, year } = req.query;

    try {
        const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();
        const targetYear = year ? parseInt(year) : new Date().getFullYear();

        const startDate = new Date(targetYear, targetMonth, 1);
        const endDate = new Date(targetYear, targetMonth + 1, 0);
        endDate.setHours(23, 59, 59, 999);

        const employee = await UserModel.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        const attendanceRecords = await AttendaceModel.find({
            employee: employeeId,
            date: { $gte: startDate, $lte: endDate }
        });

        // Get paid leave requests
        const paidLeaveRequests = await LeaveRequestModel.find({
            employee: employeeId,
            status: 'Approved',
            isPaidLeave: true,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate }
        });

        const paidLeaveDates = new Set();
        paidLeaveRequests.forEach(req => {
            const reqStart = new Date(req.startDate);
            const reqEnd = new Date(req.endDate);
            for (let d = new Date(reqStart); d <= reqEnd; d.setDate(d.getDate() + 1)) {
                const dateStr = new Date(d).toISOString().split('T')[0];
                paidLeaveDates.add(dateStr);
            }
        });

        const WORKING_DAYS_PER_MONTH = 22;
        const WORKING_HOURS_PER_DAY = 8;
        const dailySalary = employee.salary / WORKING_DAYS_PER_MONTH;
        const hourlySalary = dailySalary / WORKING_HOURS_PER_DAY;

        const unpaidLeaves = attendanceRecords.filter(r => {
            if (r.status !== 'Leave') return false;
            const dateStr = new Date(r.date).toISOString().split('T')[0];
            return !paidLeaveDates.has(dateStr);
        }).length;

        const paidLeaves = attendanceRecords.filter(r => r.status === 'Leave').length - unpaidLeaves;
        const presentDays = attendanceRecords.filter(r => r.status === 'Present').length;
        const halfDays = attendanceRecords.filter(r => r.status === 'Half Day').length;

        let calculatedSalary = employee.salary;
        calculatedSalary -= unpaidLeaves * dailySalary;
        calculatedSalary -= halfDays * (dailySalary / 2);

        const totalWorkHours = attendanceRecords.reduce((sum, r) => {
            return sum + (r.totalWorkDurationMinutes || 0) / 60;
        }, 0);

        const expectedWorkHours = (presentDays * WORKING_HOURS_PER_DAY) + (halfDays * WORKING_HOURS_PER_DAY / 2);
        const workHoursDifference = expectedWorkHours - totalWorkHours;

        if (workHoursDifference > 0) {
            calculatedSalary -= workHoursDifference * hourlySalary;
        }

        calculatedSalary = Math.max(0, calculatedSalary);

        res.status(200).json({
            success: true,
            salary: {
                baseSalary: employee.salary,
                calculatedSalary: Math.round(calculatedSalary * 100) / 100,
                deductions: Math.round((employee.salary - calculatedSalary) * 100) / 100,
                breakdown: {
                    workingDays: WORKING_DAYS_PER_MONTH,
                    presentDays,
                    paidLeaves,
                    unpaidLeaves,
                    halfDays,
                    totalWorkHours: Math.round(totalWorkHours * 10) / 10,
                    expectedWorkHours: Math.round(expectedWorkHours * 10) / 10
                }
            }
        });
    } catch (error) {
        console.error("Get My Salary Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching salary.' });
    }
};

// @desc    Employee updates their own non-sensitive profile
// @route   PUT /api/employee/profile
const updateEmployeeProfile = async (req, res) => {
    const { name, email, dob, gender, profileImage } = req.body;

    try {
        const user = await UserModel.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Allow employees to update non-sensitive fields only
        if (name) user.name = name;
        if (email) user.email = email;
        if (dob) user.dob = dob;
        if (gender) user.gender = gender;
        if (profileImage !== undefined) user.profileImage = profileImage;
        // Prevent update of sensitive fields like role, salary, employeeID, designation

        await user.save();

        const updatedUser = await UserModel.findById(req.user._id).select('-password -resetToken -resetTokenExpiry');
        res.status(200).json({ success: true, message: "Profile updated successfully.", profile: updatedUser });
    } catch (error) {
        console.error("Update Profile Error:", error.message);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Email already exists." });
        }
        res.status(500).json({ success: false, message: 'Server error updating profile.' });
    }
};

module.exports = {
    getEmployeeProfile,
    punchIn,
    lunchStart,
    lunchEnd,
    punchOut,
    getAttendanceHistory,
    getTodayAttendance,
    getMyProjects,
    updateEmployeeProfile,
    requestLeave,
    getMyLeaveRequests,
    getMyPaidLeaves,
    getMySalary,
};