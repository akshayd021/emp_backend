const express = require("express");
const { verifyUser, employeeOnly } = require("../Middleware/authMiddleware");
const {
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
} = require("../controllers/empController");

const router = express.Router();

router.use(verifyUser, employeeOnly);

// Profile
router.get("/profile", getEmployeeProfile);
router.put("/profile", updateEmployeeProfile);

// Advanced Attendance
router.get("/attendance/today", getTodayAttendance);
router.post("/attendance/check-in", punchIn);
router.post("/attendance/lunch-start", lunchStart);
router.post("/attendance/lunch-end", lunchEnd);
router.post("/attendance/check-out", punchOut);
router.get("/attendance/history", getAttendanceHistory);

// Leave Requests
router.post("/leave/request", requestLeave);
router.get("/leave/requests", getMyLeaveRequests);
router.get("/paid-leaves", getMyPaidLeaves);

// Salary
router.get("/salary", getMySalary);

// Projects
router.get("/projects", getMyProjects);

module.exports = router;