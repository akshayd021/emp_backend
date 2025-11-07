const express = require("express");
const { verifyUser, adminOnly } = require("../Middleware/authMiddleware");
const {
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
} = require("../Controllers/adminController");

const router = express.Router();

// All routes here are protected by both verifyUser and adminOnly middleware
router.use(verifyUser, adminOnly);

// Employee Management
router.post("/employees", addEmployee);
router.get("/employees", getAllEmployees);
router.put("/employees/:userId", updateEmployee);
router.delete("/employees/:userId", deleteEmployee);

// Attendance/HR Reports
router.get("/attendance/summary", getAttendanceSummary);
router.get("/attendance/leave", getEmployeesOnLeave);
router.get("/attendance/present", getPresentEmployees);
router.get("/attendance/analytics", getAttendanceAnalytics);
router.get("/attendance/report", getAttendanceReport);
router.get("/attendance/export", exportAttendanceReport);
router.get("/employees/:employeeId/stats", getEmployeeStats);

// Leave Management
router.get("/leave/requests", getPendingLeaveRequests);
router.put("/leave/requests/:requestId", respondToLeaveRequest);
router.post("/paid-leaves/reset", resetPaidLeaves);

// Salary Management
router.get("/employees/:employeeId/salary", calculateMonthlySalary);
router.get("/salaries/monthly", getMonthlySalaries);

// Project Management
router.post("/projects", createProject);
router.get("/projects", getAllProjects);
router.put("/projects/:projectId/employees", updateProjectEmployees);

module.exports = router;