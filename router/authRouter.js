const express = require("express");
const { verifyUser } = require("../Middleware/authMiddleware");
const {
  login,
  verify,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

const router = express.Router();

router.post("/login", login);
router.get("/verify", verifyUser, verify); // Check token validity
router.put("/change-password", verifyUser, changePassword); // Protected route
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

module.exports = router;