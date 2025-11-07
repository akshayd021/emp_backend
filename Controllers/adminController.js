
const mongoose = require('mongoose');
const UserModel = require('../models/UserModel');
const AttendaceModel = require('../models/AttendaceModel');
const ProjectModel = require('../models/ProjectModel');
const LeaveRequestModel = require('../models/LeaveRequestModel');
const { sendEmployeeUpdateEmail, sendLeaveResponseEmail } = require('../utils/emailService');

// @desc    Add a new employee (Admin only)
// @route   POST /api/admin/employees
const addEmployee = async (req, res) => {
    const { name, email, password, employeeID, role, designation, salary, dob, gender, profileImage } = req.body;

    if (!name || !email || !password || !employeeID || !designation || !salary || !dob || !gender) {
        return res.status(400).json({ success: false, message: "Please fill all required fields." });
    }

    try {
        const userExists = await UserModel.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: "User with this email already exists." });
        }
        
        // Note: Password hashing is handled by the pre-save hook in the User model.
        const user = await UserModel.create({
            name, email, password, employeeID, role: role || 'Employee', designation, salary, dob, gender, profileImage,
            paidLeavesAvailable: 1, // Give 1 paid leave when employee is created
            lastPaidLeaveReset: new Date()
        });

        if (user) {
            // Send welcome email to employee
            await sendEmployeeUpdateEmail(user, true);
            
            res.status(201).json({ 
                success: true, 
                message: "Employee added successfully.", 
                user: { _id: user._id, name: user.name, email: user.email } 
            });
        } else {
            res.status(400).json({ success: false, message: "Invalid user data received." });
        }
    } catch (error) {
        console.error("Add Employee Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error during adding employee.' });
    }
};

// @desc    Get all employees
// @route   GET /api/admin/employees
const getAllEmployees = async (req, res) => {
    try {
        const employees = await UserModel.find({ role: 'Employee' }).select('-password -resetToken -resetTokenExpiry');
        res.status(200).json({ success: true, employees });
    } catch (error) {
        console.error("Get Employees Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching employees.' });
    }
};

// @desc    Get daily attendance summary (Present/Leave count)
// @route   GET /api/admin/attendance/summary
const getAttendanceSummary = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const allEmployeesCount = await UserModel.countDocuments({ role: 'Employee' });
        
        // Get all existing employee IDs to filter out orphaned attendance records
        const existingEmployeeIds = await UserModel.find({ role: 'Employee' }).select('_id').lean();
        const employeeIds = existingEmployeeIds.map(emp => emp._id);
        
        const attendanceRecords = await AttendaceModel.aggregate([
            { 
                $match: { 
                    date: today,
                    employee: { $in: employeeIds } // Only count records for existing employees
                } 
            },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const present = attendanceRecords.find(r => r._id === 'Present')?.count || 0;
        const onLeave = attendanceRecords.find(r => r._id === 'Leave')?.count || 0;
        const halfDay = attendanceRecords.find(r => r._id === 'Half Day')?.count || 0;
        const markedAbsent = attendanceRecords.find(r => r._id === 'Absent')?.count || 0;

        // Total employees with attendance records today
        const totalWithRecords = present + onLeave + halfDay + markedAbsent;
        
        // Absent/Pending = Total employees - employees with records (includes both marked absent and no record)
        const absentPending = Math.max(0, allEmployeesCount - totalWithRecords);

        const summary = {
            present,
            onLeave,
            halfDay,
            absent: absentPending + markedAbsent, // Include both pending and explicitly marked absent
        };

        res.status(200).json({ success: true, allEmployeesCount, summary });
    } catch (error) {
        console.error("Attendance Summary Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching attendance summary.' });
    }
};

// @desc    Get employees currently on leave
// @route   GET /api/admin/attendance/leave
const getEmployeesOnLeave = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get existing employee IDs first
        const existingEmployeeIds = await UserModel.find({ role: 'Employee' }).select('_id').lean();
        const employeeIds = existingEmployeeIds.map(emp => emp._id);

        const employeesOnLeave = await AttendaceModel.find({ 
            date: today, 
            status: 'Leave',
            employee: { $in: employeeIds } // Only get records for existing employees
        })
        .populate('employee', 'name employeeID designation');

        res.status(200).json({ success: true, employeesOnLeave: employeesOnLeave.map(att => att.employee) });
    } catch (error) {
        console.error("Leave Employees Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching employees on leave.' });
    }
};

// @desc    Get all present employees today
// @route   GET /api/admin/attendance/present
const getPresentEmployees = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get existing employee IDs first
        const existingEmployeeIds = await UserModel.find({ role: 'Employee' }).select('_id').lean();
        const employeeIds = existingEmployeeIds.map(emp => emp._id);

        const presentEmployees = await AttendaceModel.find({ 
            date: today, 
            status: 'Present',
            employee: { $in: employeeIds } // Only get records for existing employees
        })
        .populate('employee', 'name employeeID designation email')
        .select('employee punchIn lunchStart lunchEnd punchOut');

        res.status(200).json({ 
            success: true, 
            presentEmployees: presentEmployees
                .filter(att => att.employee !== null && att.employee !== undefined)
                .map(att => ({
                    employee: att.employee,
                    punchIn: att.punchIn,
                    lunchStart: att.lunchStart,
                    lunchEnd: att.lunchEnd,
                    punchOut: att.punchOut
                }))
        });
    } catch (error) {
        console.error("Present Employees Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching present employees.' });
    }
};

// @desc    Get attendance analytics (last 30 days trends)
// @route   GET /api/admin/attendance/analytics
const getAttendanceAnalytics = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get existing employee IDs
        const existingEmployeeIds = await UserModel.find({ role: 'Employee' }).select('_id').lean();
        const employeeIds = existingEmployeeIds.map(emp => emp._id);

        // Daily attendance trends for last 30 days
        const dailyTrends = await AttendaceModel.aggregate([
            {
                $match: {
                    date: { $gte: thirtyDaysAgo, $lte: today },
                    employee: { $in: employeeIds }
                }
            },
            {
                $group: {
                    _id: {
                        date: '$date',
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.date': 1 } }
        ]);

        // Weekly summary
        const weeklySummary = await AttendaceModel.aggregate([
            {
                $match: {
                    date: { $gte: thirtyDaysAgo, $lte: today },
                    employee: { $in: employeeIds }
                }
            },
            {
                $group: {
                    _id: {
                        week: { $week: '$date' },
                        year: { $year: '$date' },
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Average attendance rate
        const totalDays = 30;
        const totalPossibleAttendance = employeeIds.length * totalDays;
        const totalPresent = await AttendaceModel.countDocuments({
            date: { $gte: thirtyDaysAgo, $lte: today },
            status: 'Present',
            employee: { $in: employeeIds }
        });
        const attendanceRate = totalPossibleAttendance > 0 
            ? ((totalPresent / totalPossibleAttendance) * 100).toFixed(2)
            : 0;

        res.status(200).json({
            success: true,
            dailyTrends,
            weeklySummary,
            attendanceRate: parseFloat(attendanceRate),
            totalEmployees: employeeIds.length
        });
    } catch (error) {
        console.error("Attendance Analytics Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching attendance analytics.' });
    }
};

// @desc    Get attendance report for date range
// @route   GET /api/admin/attendance/report
const getAttendanceReport = async (req, res) => {
    try {
        const { startDate, endDate, employeeId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: "Start date and end date are required." });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Get existing employee IDs
        const existingEmployeeIds = await UserModel.find({ role: 'Employee' }).select('_id').lean();
        const employeeIds = existingEmployeeIds.map(emp => emp._id);

        const matchQuery = {
            date: { $gte: start, $lte: end },
            employee: { $in: employeeIds }
        };

        if (employeeId) {
            matchQuery.employee = new mongoose.Types.ObjectId(employeeId);
        }

        const report = await AttendaceModel.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalWorkMinutes: { $sum: '$totalWorkDurationMinutes' }
                }
            }
        ]);

        const detailedReport = await AttendaceModel.find(matchQuery)
            .populate('employee', 'name employeeID designation')
            .sort({ date: -1 })
            .limit(100);

        res.status(200).json({ 
            success: true, 
            summary: report,
            detailedReport: detailedReport.filter(att => att.employee !== null)
        });
    } catch (error) {
        console.error("Attendance Report Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching attendance report.' });
    }
};

// @desc    Export attendance report to CSV
// @route   GET /api/admin/attendance/export
const exportAttendanceReport = async (req, res) => {
    try {
        const { startDate, endDate, employeeId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: "Start date and end date are required." });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Get existing employee IDs
        const existingEmployeeIds = await UserModel.find({ role: 'Employee' }).select('_id').lean();
        const employeeIds = existingEmployeeIds.map(emp => emp._id);

        const matchQuery = {
            date: { $gte: start, $lte: end },
            employee: { $in: employeeIds }
        };

        if (employeeId) {
            matchQuery.employee = new mongoose.Types.ObjectId(employeeId);
        }

        const attendanceRecords = await AttendaceModel.find(matchQuery)
            .populate('employee', 'name employeeID designation email')
            .sort({ date: -1, employee: 1 });

        // Generate CSV
        const csvHeader = 'Date,Employee Name,Employee ID,Designation,Email,Status,Punch In,Lunch Start,Lunch End,Punch Out,Work Hours\n';
        const csvRows = attendanceRecords
            .filter(att => att.employee !== null)
            .map(att => {
                const date = new Date(att.date).toLocaleDateString();
                const punchIn = att.punchIn ? new Date(att.punchIn).toLocaleTimeString() : '';
                const lunchStart = att.lunchStart ? new Date(att.lunchStart).toLocaleTimeString() : '';
                const lunchEnd = att.lunchEnd ? new Date(att.lunchEnd).toLocaleTimeString() : '';
                const punchOut = att.punchOut ? new Date(att.punchOut).toLocaleTimeString() : '';
                const workHours = att.totalWorkDurationMinutes 
                    ? `${Math.floor(att.totalWorkDurationMinutes / 60)}h ${att.totalWorkDurationMinutes % 60}m`
                    : '';
                
                return `"${date}","${att.employee.name}","${att.employee.employeeID}","${att.employee.designation}","${att.employee.email}","${att.status}","${punchIn}","${lunchStart}","${lunchEnd}","${punchOut}","${workHours}"`;
            })
            .join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance-report-${startDate}-to-${endDate}.csv`);
        res.status(200).send(csv);
    } catch (error) {
        console.error("Export Attendance Report Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error exporting attendance report.' });
    }
};

// @desc    Get employee statistics
// @route   GET /api/admin/employees/:employeeId/stats
const getEmployeeStats = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { month, year } = req.query;

        const startDate = new Date(year || new Date().getFullYear(), (month ? parseInt(month) - 1 : new Date().getMonth()), 1);
        const endDate = new Date(year || new Date().getFullYear(), (month ? parseInt(month) : new Date().getMonth() + 1), 0);
        endDate.setHours(23, 59, 59, 999);

        const attendanceRecords = await AttendaceModel.find({
            employee: employeeId,
            date: { $gte: startDate, $lte: endDate }
        });

        const stats = {
            totalDays: attendanceRecords.length,
            present: attendanceRecords.filter(r => r.status === 'Present').length,
            absent: attendanceRecords.filter(r => r.status === 'Absent').length,
            leave: attendanceRecords.filter(r => r.status === 'Leave').length,
            halfDay: attendanceRecords.filter(r => r.status === 'Half Day').length,
            totalWorkHours: Math.round(attendanceRecords.reduce((sum, r) => sum + (r.totalWorkDurationMinutes || 0), 0) / 60),
            averageWorkHours: attendanceRecords.length > 0 
                ? Math.round((attendanceRecords.reduce((sum, r) => sum + (r.totalWorkDurationMinutes || 0), 0) / 60) / attendanceRecords.length * 10) / 10
                : 0
        };

        res.status(200).json({ success: true, stats });
    } catch (error) {
        console.error("Employee Stats Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching employee statistics.' });
    }
};

// @desc    Get all pending leave requests
// @route   GET /api/admin/leave/requests
const getPendingLeaveRequests = async (req, res) => {
    try {
        const leaveRequests = await LeaveRequestModel.find({ status: 'Pending' })
            .populate('employee', 'name employeeID designation email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, leaveRequests });
    } catch (error) {
        console.error("Get Leave Requests Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching leave requests.' });
    }
};

// @desc    Accept or reject leave request
// @route   PUT /api/admin/leave/requests/:requestId
const respondToLeaveRequest = async (req, res) => {
    const { requestId } = req.params;
    const { action, adminResponse } = req.body; // action: 'approve' or 'reject'

    if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, message: "Invalid action. Must be 'approve' or 'reject'." });
    }

    try {
        const leaveRequest = await LeaveRequestModel.findById(requestId).populate('employee');
        
        if (!leaveRequest) {
            return res.status(404).json({ success: false, message: "Leave request not found." });
        }

        if (leaveRequest.status !== 'Pending') {
            return res.status(400).json({ success: false, message: "Leave request has already been processed." });
        }

        leaveRequest.status = action === 'approve' ? 'Approved' : 'Rejected';
        leaveRequest.adminResponse = adminResponse || '';
        leaveRequest.respondedBy = req.user._id;
        leaveRequest.respondedAt = new Date();

        await leaveRequest.save();

        // If approved, mark attendance records as Leave for the date range
        if (action === 'approve') {
            const startDate = new Date(leaveRequest.startDate);
            const endDate = new Date(leaveRequest.endDate);
            const leaveDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            
            // Deduct paid leave if it's a paid leave request
            if (leaveRequest.isPaidLeave) {
                const employee = await UserModel.findById(leaveRequest.employee._id);
                employee.paidLeavesAvailable = Math.max(0, employee.paidLeavesAvailable - leaveDays);
                await employee.save();
            }
            
            // Mark all dates in the range as Leave
            for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
                const dayStart = new Date(date);
                dayStart.setHours(0, 0, 0, 0);
                
                await AttendaceModel.findOneAndUpdate(
                    { employee: leaveRequest.employee._id, date: dayStart },
                    { 
                        status: 'Leave',
                        leaveType: leaveRequest.leaveType
                    },
                    { upsert: true, new: true }
                );
            }
        }

        // Send email to employee
        await sendLeaveResponseEmail(leaveRequest, leaveRequest.employee);

        res.status(200).json({ 
            success: true, 
            message: `Leave request ${action === 'approve' ? 'approved' : 'rejected'} successfully.`,
            leaveRequest 
        });
    } catch (error) {
        console.error("Respond to Leave Request Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error responding to leave request.' });
    }
};

// @desc    Projects: create, update, get all (including employee assignments)
// @route   POST /api/admin/projects
const createProject = async (req, res) => {
    const { name, description, status, employeeIds, dueDate } = req.body;

    if (!name || !description || !employeeIds || !Array.isArray(employeeIds)) {
        return res.status(400).json({ success: false, message: "Missing required project fields or employee IDs." });
    }

    try {
        const project = await ProjectModel.create({
            name,
            description,
            status: status || 'Running',
            employees: employeeIds,
            dueDate
        });

        res.status(201).json({ success: true, message: 'Project created and employees assigned.', project });
    } catch (error) {
        console.error("Create Project Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error creating project.' });
    }
};

// @desc    Get all projects with assigned employees
// @route   GET /api/admin/projects
const getAllProjects = async (req, res) => {
    try {
        const projects = await ProjectModel.find({})
            .populate('employees', 'name employeeID designation email'); // Show which employee is working on it
        
        res.status(200).json({ success: true, projects });
    } catch (error) {
        console.error("Get Projects Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching projects.' });
    }
};

// @desc    Assign/Unassign employees to a project
// @route   PUT /api/admin/projects/:projectId/employees
const updateProjectEmployees = async (req, res) => {
    const { projectId } = req.params;
    const { employeeIds } = req.body;

    try {
        const project = await ProjectModel.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }

        // Replace existing employee array with new list
        project.employees = employeeIds;
        await project.save();

        res.status(200).json({ success: true, message: "Project employees updated successfully.", project });
    } catch (error) {
        console.error("Update Project Employees Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error updating project employees.' });
    }
};

// @desc    Update an employee
// @route   PUT /api/admin/employees/:userId
const updateEmployee = async (req, res) => {
    const { userId } = req.params;
    const { name, email, employeeID, designation, salary, dob, gender, profileImage } = req.body;

    try {
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        if (user.role === 'Admin' && req.user._id.toString() !== userId) {
            return res.status(400).json({ success: false, message: "Cannot modify other admin accounts." });
        }

        // Update fields if provided
        if (name) user.name = name;
        if (email) user.email = email;
        if (employeeID) user.employeeID = employeeID;
        if (designation) user.designation = designation;
        if (salary !== undefined) user.salary = parseFloat(salary);
        if (dob) user.dob = dob;
        if (gender) user.gender = gender;
        if (profileImage !== undefined) user.profileImage = profileImage;

        await user.save();

        const updatedUser = await UserModel.findById(userId).select('-password -resetToken -resetTokenExpiry');
        
        // Send email to employee about profile update
        await sendEmployeeUpdateEmail(updatedUser, false);
        
        res.status(200).json({ success: true, message: "Employee updated successfully.", employee: updatedUser });
    } catch (error) {
        console.error("Update Employee Error:", error.message);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Email or Employee ID already exists." });
        }
        res.status(500).json({ success: false, message: 'Server error updating employee.' });
    }
};

// @desc    Delete an employee
// @route   DELETE /api/admin/employees/:userId
const deleteEmployee = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        if (user.role === 'Admin') {
            return res.status(400).json({ success: false, message: "Cannot delete admin account." });
        }

        // Delete related data: attendance records, leave requests, and remove from projects
        await AttendaceModel.deleteMany({ employee: userId });
        await LeaveRequestModel.deleteMany({ employee: userId });
        
        // Remove employee from all projects
        await ProjectModel.updateMany(
            { employees: userId },
            { $pull: { employees: userId } }
        );

        await UserModel.findByIdAndDelete(userId);
        res.status(200).json({ success: true, message: "Employee and all related data deleted successfully." });
    } catch (error) {
        console.error("Delete Employee Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error deleting employee.' });
    }
};

// @desc    Reset paid leaves for all employees (monthly - adds 1 paid leave)
// @route   POST /api/admin/paid-leaves/reset
const resetPaidLeaves = async (req, res) => {
    try {
        const employees = await UserModel.find({ role: 'Employee' });
        const now = new Date();
        
        for (const employee of employees) {
            // Add 1 paid leave and carryover existing ones
            employee.paidLeavesAvailable = (employee.paidLeavesAvailable || 0) + 1;
            employee.lastPaidLeaveReset = now;
            await employee.save();
        }

        res.status(200).json({ 
            success: true, 
            message: `Paid leaves reset successfully. ${employees.length} employees received 1 paid leave.` 
        });
    } catch (error) {
        console.error("Reset Paid Leaves Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error resetting paid leaves.' });
    }
};

// @desc    Calculate monthly salary for an employee
// @route   GET /api/admin/employees/:employeeId/salary
const calculateMonthlySalary = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { month, year } = req.query;

        const employee = await UserModel.findById(employeeId);
        if (!employee || employee.role !== 'Employee') {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        
        const startDate = new Date(targetYear, targetMonth, 1);
        const endDate = new Date(targetYear, targetMonth + 1, 0);
        endDate.setHours(23, 59, 59, 999);

        // Get attendance records for the month
        const attendanceRecords = await AttendaceModel.find({
            employee: employeeId,
            date: { $gte: startDate, $lte: endDate }
        });

        // Constants
        const WORKING_DAYS_PER_MONTH = 22;
        const WORKING_HOURS_PER_DAY = 8;
        const dailySalary = employee.salary / WORKING_DAYS_PER_MONTH;
        const hourlySalary = dailySalary / WORKING_HOURS_PER_DAY;

        // Get all approved paid leave requests for this month
        const paidLeaveRequests = await LeaveRequestModel.find({
            employee: employeeId,
            status: 'Approved',
            isPaidLeave: true,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate }
        });

        // Create a set of dates that are paid leaves
        const paidLeaveDates = new Set();
        paidLeaveRequests.forEach(req => {
            const reqStart = new Date(req.startDate);
            const reqEnd = new Date(req.endDate);
            for (let d = new Date(reqStart); d <= reqEnd; d.setDate(d.getDate() + 1)) {
                const dateStr = new Date(d).toISOString().split('T')[0];
                paidLeaveDates.add(dateStr);
            }
        });

        // Count unpaid leaves (leaves that are not in paid leave dates)
        const unpaidLeaves = attendanceRecords.filter(r => {
            if (r.status !== 'Leave') return false;
            const dateStr = new Date(r.date).toISOString().split('T')[0];
            return !paidLeaveDates.has(dateStr);
        }).length;

        const paidLeaves = attendanceRecords.filter(r => r.status === 'Leave').length - unpaidLeaves;
        const presentDays = attendanceRecords.filter(r => r.status === 'Present').length;
        const halfDays = attendanceRecords.filter(r => r.status === 'Half Day').length;

        // Calculate salary
        let calculatedSalary = employee.salary;
        
        // Deduct for unpaid leaves (full day deduction)
        calculatedSalary -= unpaidLeaves * dailySalary;
        
        // Deduct for half days (half day deduction)
        calculatedSalary -= halfDays * (dailySalary / 2);

        // Calculate based on actual work hours if present
        const totalWorkHours = attendanceRecords.reduce((sum, r) => {
            return sum + (r.totalWorkDurationMinutes || 0) / 60;
        }, 0);
        
        const expectedWorkHours = (presentDays * WORKING_HOURS_PER_DAY) + (halfDays * WORKING_HOURS_PER_DAY / 2);
        const workHoursDifference = expectedWorkHours - totalWorkHours;
        
        // If worked less than expected, deduct proportionally
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
        console.error("Calculate Salary Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error calculating salary.' });
    }
};

// @desc    Get monthly salary for all employees
// @route   GET /api/admin/salaries/monthly
const getMonthlySalaries = async (req, res) => {
    try {
        const { month, year } = req.query;
        const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        
        const startDate = new Date(targetYear, targetMonth, 1);
        const endDate = new Date(targetYear, targetMonth + 1, 0);
        endDate.setHours(23, 59, 59, 999);

        const employees = await UserModel.find({ role: 'Employee' }).select('-password');
        const salaries = [];

        for (const employee of employees) {
            const attendanceRecords = await AttendaceModel.find({
                employee: employee._id,
                date: { $gte: startDate, $lte: endDate }
            });

            // Get paid leave requests for this month
            const paidLeaveRequests = await LeaveRequestModel.find({
                employee: employee._id,
                status: 'Approved',
                isPaidLeave: true,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate }
            });

            // Create set of paid leave dates
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

            // Count unpaid leaves (leaves not in paid leave dates)
            const unpaidLeaves = attendanceRecords.filter(r => {
                if (r.status !== 'Leave') return false;
                const dateStr = new Date(r.date).toISOString().split('T')[0];
                return !paidLeaveDates.has(dateStr);
            }).length;

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

            salaries.push({
                employee: {
                    _id: employee._id,
                    name: employee.name,
                    employeeID: employee.employeeID,
                    designation: employee.designation,
                    email: employee.email
                },
                baseSalary: employee.salary,
                calculatedSalary: Math.round(calculatedSalary * 100) / 100,
                deductions: Math.round((employee.salary - calculatedSalary) * 100) / 100,
                paidLeavesAvailable: employee.paidLeavesAvailable || 0,
                breakdown: {
                    presentDays,
                    unpaidLeaves,
                    halfDays,
                    totalWorkHours: Math.round(totalWorkHours * 10) / 10
                }
            });
        }

        res.status(200).json({
            success: true,
            month: targetMonth + 1,
            year: targetYear,
            salaries
        });
    } catch (error) {
        console.error("Get Monthly Salaries Error:", error.message);
        res.status(500).json({ success: false, message: 'Server error fetching monthly salaries.' });
    }
};


module.exports = {
    addEmployee,
    getAllEmployees,
    updateEmployee,
    deleteEmployee,
    getAttendanceSummary,
    getEmployeesOnLeave,
    getPresentEmployees,
    getAttendanceAnalytics,
    getAttendanceReport,
    exportAttendanceReport,
    getEmployeeStats,
    createProject,
    getAllProjects,
    updateProjectEmployees,
    getPendingLeaveRequests,
    respondToLeaveRequest,
    resetPaidLeaves,
    calculateMonthlySalary,
    getMonthlySalaries,
};
