const nodemailer = require('nodemailer');

const SMTP_USER = 'utsavvasoya99@gmail.com';
const SMTP_PASS = 'uptdpvaxaavevvbp';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

// Send email when employee is added/edited
const sendEmployeeUpdateEmail = async (employee, isNew = false) => {
    try {
        const subject = isNew 
            ? 'Welcome to IT Management System - Your Account Has Been Created'
            : 'Your Employee Profile Has Been Updated';
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">${isNew ? 'Welcome!' : 'Profile Updated'}</h2>
                <p>Dear ${employee.name},</p>
                <p>${isNew 
                    ? 'Your employee account has been created successfully. You can now access the system using the following credentials:'
                    : 'Your employee profile has been updated by the administrator. Please review your updated information.'}</p>
                ${isNew ? `
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Email:</strong> ${employee.email}</p>
                    <p><strong>Employee ID:</strong> ${employee.employeeID}</p>
                    <p><strong>Designation:</strong> ${employee.designation}</p>
                </div>
                <p><strong>Note:</strong> Please change your password after first login for security.</p>
                ` : ''}
                <p>You can access the system by clicking the button below:</p>
                <a href="${FRONTEND_URL}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                    Access Dashboard
                </a>
                <p>Or copy this link: <a href="${FRONTEND_URL}">${FRONTEND_URL}</a></p>
                <p style="margin-top: 30px; color: #666; font-size: 12px;">Best regards,<br>IT Management System</p>
            </div>
        `;

        await transporter.sendMail({
            from: SMTP_USER,
            to: employee.email,
            subject,
            html,
        });
    } catch (error) {
        console.error('Error sending employee update email:', error);
    }
};

// Send email when leave request is submitted
const sendLeaveRequestEmail = async (leaveRequest, adminEmails) => {
    try {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">New Leave Request</h2>
                <p>Dear Admin,</p>
                <p>A new leave request has been submitted:</p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Employee:</strong> ${leaveRequest.employee.name} (${leaveRequest.employee.employeeID})</p>
                    <p><strong>Leave Type:</strong> ${leaveRequest.leaveType}</p>
                    <p><strong>Start Date:</strong> ${new Date(leaveRequest.startDate).toLocaleDateString()}</p>
                    <p><strong>End Date:</strong> ${new Date(leaveRequest.endDate).toLocaleDateString()}</p>
                    <p><strong>Reason:</strong> ${leaveRequest.reason}</p>
                </div>
                <p>Please review and respond to this request.</p>
                <a href="${FRONTEND_URL}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                    View Request
                </a>
            </div>
        `;

        // Send to all admins
        for (const adminEmail of adminEmails) {
            await transporter.sendMail({
                from: SMTP_USER,
                to: adminEmail,
                subject: `Leave Request from ${leaveRequest.employee.name}`,
                html,
            });
        }
    } catch (error) {
        console.error('Error sending leave request email:', error);
    }
};

// Send email when leave request is approved/rejected
const sendLeaveResponseEmail = async (leaveRequest, employee) => {
    try {
        const isApproved = leaveRequest.status === 'Approved';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: ${isApproved ? '#10b981' : '#ef4444'};">
                    Leave Request ${isApproved ? 'Approved' : 'Rejected'}
                </h2>
                <p>Dear ${employee.name},</p>
                <p>Your leave request has been <strong>${leaveRequest.status.toLowerCase()}</strong>.</p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Leave Type:</strong> ${leaveRequest.leaveType}</p>
                    <p><strong>Start Date:</strong> ${new Date(leaveRequest.startDate).toLocaleDateString()}</p>
                    <p><strong>End Date:</strong> ${new Date(leaveRequest.endDate).toLocaleDateString()}</p>
                    ${leaveRequest.adminResponse ? `<p><strong>Admin Response:</strong> ${leaveRequest.adminResponse}</p>` : ''}
                </div>
                <a href="${FRONTEND_URL}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                    View Details
                </a>
            </div>
        `;

        await transporter.sendMail({
            from: SMTP_USER,
            to: employee.email,
            subject: `Leave Request ${leaveRequest.status}`,
            html,
        });
    } catch (error) {
        console.error('Error sending leave response email:', error);
    }
};

module.exports = {
    sendEmployeeUpdateEmail,
    sendLeaveRequestEmail,
    sendLeaveResponseEmail,
};


