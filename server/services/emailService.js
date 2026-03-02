const nodemailer = require('nodemailer');
const config = require('../config');

// Create transporter (configure based on your email provider)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify transporter connection
const verifyConnection = async () => {
  try {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      await transporter.verify();
      console.log('✅ Email service connected');
      return true;
    }
    console.log('⚠️ Email service not configured (missing SMTP credentials)');
    return false;
  } catch (error) {
    console.error('❌ Email service error:', error.message);
    return false;
  }
};

// Send OTP email
const sendOTPEmail = async (email, otp, name = '') => {
  const mailOptions = {
    from: `"Grievance Portal" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your OTP for Grievance Portal Login',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #3b82f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .otp-code { font-size: 36px; font-weight: bold; color: #3b82f6; letter-spacing: 8px; }
          .footer { text-align: center; margin-top: 20px; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏛️ Grievance Portal</h1>
          </div>
          <div class="content">
            <p>Hello${name ? ` ${name}` : ''},</p>
            <p>Your One-Time Password (OTP) for login is:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p>This OTP is valid for <strong>10 minutes</strong>.</p>
            <p>If you didn't request this OTP, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2026 Government Grievance Portal. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

// Send complaint status update email
const sendStatusUpdateEmail = async (email, complaint, previousStatus, newStatus) => {
  const statusColors = {
    pending: '#f59e0b',
    in_progress: '#3b82f6',
    closed: '#10b981',
    rejected: '#ef4444',
    duplicate: '#6b7280',
  };

  const statusLabels = {
    pending: 'Pending',
    in_progress: 'In Progress',
    closed: 'Closed',
    rejected: 'Rejected',
    duplicate: 'Duplicate',
  };

  const mailOptions = {
    from: `"Grievance Portal" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `Complaint ${complaint.complaintId} - Status Updated to ${statusLabels[newStatus]}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; color: white; font-weight: bold; }
          .complaint-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
          .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏛️ Status Update</h1>
            <p>Your complaint status has been updated</p>
          </div>
          <div class="content">
            <div class="complaint-details">
              <div class="detail-row">
                <strong>Complaint ID:</strong>
                <span>${complaint.complaintId}</span>
              </div>
              <div class="detail-row">
                <strong>Category:</strong>
                <span>${complaint.category.replace(/_/g, ' ').toUpperCase()}</span>
              </div>
              <div class="detail-row">
                <strong>Previous Status:</strong>
                <span class="status-badge" style="background: ${statusColors[previousStatus]}">${statusLabels[previousStatus]}</span>
              </div>
              <div class="detail-row">
                <strong>New Status:</strong>
                <span class="status-badge" style="background: ${statusColors[newStatus]}">${statusLabels[newStatus]}</span>
              </div>
              ${complaint.address?.fullAddress ? `
              <div class="detail-row">
                <strong>Location:</strong>
                <span>${complaint.address.fullAddress}</span>
              </div>
              ` : ''}
            </div>
            <center>
              <a href="${config.clientUrl}/track?id=${complaint.complaintId}" class="btn">
                Track Your Complaint
              </a>
            </center>
          </div>
          <div class="footer">
            <p>© 2026 Government Grievance Portal. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

// Send escalation notification email to admin
const sendEscalationEmail = async (adminEmail, complaint, escalationLevel) => {
  const mailOptions = {
    from: `"Grievance Portal - URGENT" <${process.env.SMTP_USER}>`,
    to: adminEmail,
    subject: `⚠️ ESCALATION: Complaint ${complaint.complaintId} - Level ${escalationLevel}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #fef2f2; padding: 30px; border-radius: 0 0 10px 10px; }
          .alert-box { background: white; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; }
          .btn { display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ ESCALATION ALERT</h1>
            <p>Immediate attention required</p>
          </div>
          <div class="content">
            <div class="alert-box">
              <h3>Complaint ${complaint.complaintId} has been escalated to Level ${escalationLevel}</h3>
              <p><strong>Reason:</strong> SLA breach - complaint overdue for resolution</p>
              <p><strong>Category:</strong> ${complaint.category.replace(/_/g, ' ').toUpperCase()}</p>
              <p><strong>Filed On:</strong> ${new Date(complaint.createdAt).toLocaleDateString()}</p>
              <p><strong>Days Pending:</strong> ${Math.floor((Date.now() - new Date(complaint.createdAt)) / (1000 * 60 * 60 * 24))} days</p>
            </div>
            <center>
              <a href="${config.clientUrl}/admin/complaints/${complaint._id}" class="btn">
                View Complaint
              </a>
            </center>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  verifyConnection,
  sendOTPEmail,
  sendStatusUpdateEmail,
  sendEscalationEmail,
};
