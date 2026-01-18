const express = require('express');
const bcrypt = require('bcryptjs');
const { connectDB } = require('../db');
const { generateToken } = require('../middleware/auth');
const { sendOTPEmail } = require('../utils/emailService');
const { ObjectId } = require('mongodb');

const router = express.Router();

// In-memory OTP storage (in production, use Redis or database)
const otpStore = {};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// SIGN UP - Generate and send OTP
router.post('/signup', async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ message: 'Email, password, name, and role are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const validRoles = ['Admin', 'Sales', 'General Manager', 'Store Manager', 'Production Team', 'Account', 'Collection', 'Logistics'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role selected' });
  }

  try {
    const { usersCollection } = await connectDB();

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiry (10 minutes)
    otpStore[email] = {
      otp,
      password: await bcrypt.hash(password, 10),
      name,
      role,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    // Send OTP email to admin (softwareakolite@gmail.com)
    const emailSent = await sendOTPEmail(email, name, role, otp);

    if (emailSent) {
      res.status(200).json({
        message: 'OTP sent to email. Please verify to complete signup.',
        email,
      });
    } else {
      delete otpStore[email];
      res.status(500).json({ message: 'Failed to send OTP email' });
    }
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// VERIFY OTP - Complete signup
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }

  try {
    // Check if OTP exists and is valid
    const otpData = otpStore[email];
    if (!otpData) {
      return res.status(400).json({ message: 'OTP expired or not found. Please sign up again.' });
    }

    if (Date.now() > otpData.expiresAt) {
      delete otpStore[email];
      return res.status(400).json({ message: 'OTP has expired. Please sign up again.' });
    }

    if (otpData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // OTP verified, create user
    const { usersCollection } = await connectDB();

    const newUser = {
      email,
      name: otpData.name,
      role: otpData.role,
      password: otpData.password,
      createdAt: new Date(),
      isVerified: true,
    };

    const result = await usersCollection.insertOne(newUser);
    const token = generateToken(result.insertedId, email, otpData.role);

    // Clean up OTP
    delete otpStore[email];

    res.json({
      message: 'Email verified successfully. Account created!',
      token,
      user: { id: result.insertedId, email, name: otpData.name, role: otpData.role },
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const { usersCollection } = await connectDB();

    // Find user
    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user._id, email, user.role);

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET CURRENT USER
router.get('/me', async (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const { usersCollection } = await connectDB();
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
