const nodemailer = require('nodemailer');

// Configure Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'softwareakolite@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Verify connection
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email service error:', error.message);
  } else {
    console.log('✅ Email service ready');
  }
});

const sendOTPEmail = async (userEmail, userName, userRole, otp) => {
  const mailOptions = {
    from: 'softwareakolite@gmail.com',
    to: 'softwareakolite@gmail.com', // Always send to admin email
    subject: `New Signup Request - OTP Verification`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">New User Signup Request</h2>
        <p>A new user has requested to create an account. Here are the details:</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Name:</strong> ${userName}</p>
          <p><strong>Email:</strong> ${userEmail}</p>
          <p><strong>Role:</strong> ${userRole}</p>
        </div>

        <p>Use the following OTP to verify and approve this signup:</p>
        <div style="background-color: #2196F3; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h1 style="color: white; letter-spacing: 5px; margin: 0;">${otp}</h1>
        </div>
        <p><strong>This OTP will expire in 10 minutes.</strong></p>
        <p style="color: #666; font-size: 12px;">Share this OTP with the user so they can complete their registration.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP sent to admin email for user: ${userEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    return false;
  }
};

module.exports = { sendOTPEmail };
