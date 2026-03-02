const Citizen = require('../models/Citizen');
const Complaint = require('../models/Complaint');
const { sendOTPEmail } = require('../services/emailService');
const crypto = require('crypto');

/**
 * Request OTP for login/signup
 */
exports.requestOTP = async (req, res) => {
  try {
    const { phoneNumber, email } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    // Find or create citizen
    let citizen = await Citizen.findOne({ phoneNumber });
    
    if (!citizen) {
      citizen = new Citizen({ phoneNumber, email });
    } else if (email && !citizen.email) {
      citizen.email = email;
    }

    // Check rate limiting (max 3 OTPs per 10 minutes)
    if (citizen.otp?.lastSentAt) {
      const timeSinceLastOTP = Date.now() - new Date(citizen.otp.lastSentAt);
      if (timeSinceLastOTP < 60000) { // 1 minute cooldown
        return res.status(429).json({
          success: false,
          message: 'Please wait before requesting another OTP',
          retryAfter: Math.ceil((60000 - timeSinceLastOTP) / 1000),
        });
      }
    }

    // Generate OTP
    const otp = citizen.generateOTP();
    await citizen.save();

    // In development, return OTP in response (remove in production!)
    const isDev = process.env.NODE_ENV !== 'production';

    // Send OTP via email if available
    if (citizen.email) {
      await sendOTPEmail(citizen.email, otp, citizen.name);
    }

    // TODO: Send OTP via SMS in production
    console.log(`📱 OTP for ${phoneNumber}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      ...(isDev && { otp }), // Only in development
    });
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
    });
  }
};

/**
 * Verify OTP and login
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required',
      });
    }

    const citizen = await Citizen.findOne({ phoneNumber });
    
    if (!citizen) {
      return res.status(404).json({
        success: false,
        message: 'Phone number not found. Please request OTP first.',
      });
    }

    if (citizen.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact support.',
      });
    }

    // Verify OTP
    const result = citizen.verifyOTP(otp);
    
    if (!result.valid) {
      await citizen.save(); // Save attempt count
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    // Generate session token
    const deviceInfo = req.headers['user-agent'] || 'Unknown';
    const token = citizen.generateSessionToken(deviceInfo);
    await citizen.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        citizen: {
          phoneNumber: citizen.phoneNumber,
          name: citizen.name,
          email: citizen.email,
          preferences: citizen.preferences,
          stats: citizen.stats,
        },
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
    });
  }
};

/**
 * Get citizen profile
 */
exports.getProfile = async (req, res) => {
  try {
    const citizen = req.citizen;
    
    // Get complaint statistics
    const stats = await Complaint.aggregate([
      {
        $match: {
          'user.phoneNumber': citizen.phoneNumber,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          closed: {
            $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] }
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        phoneNumber: citizen.phoneNumber,
        name: citizen.name,
        email: citizen.email,
        preferences: citizen.preferences,
        stats: stats[0] || { total: 0, pending: 0, inProgress: 0, closed: 0 },
        createdAt: citizen.createdAt,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
    });
  }
};

/**
 * Update citizen profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const citizen = req.citizen;
    const { name, email, preferences } = req.body;

    if (name) citizen.name = name;
    if (email) citizen.email = email;
    if (preferences) {
      citizen.preferences = { ...citizen.preferences, ...preferences };
    }

    await citizen.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        phoneNumber: citizen.phoneNumber,
        name: citizen.name,
        email: citizen.email,
        preferences: citizen.preferences,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
};

/**
 * Get citizen's complaints
 */
exports.getMyComplaints = async (req, res) => {
  try {
    const citizen = req.citizen;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { 'user.phoneNumber': citizen.phoneNumber };
    if (status) query.status = status;

    const complaints = await Complaint.find(query)
      .select('-voiceNote.filePath')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Complaint.countDocuments(query);

    res.json({
      success: true,
      data: {
        complaints,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get complaints',
    });
  }
};

/**
 * Submit feedback for closed complaint
 */
exports.submitFeedback = async (req, res) => {
  try {
    const citizen = req.citizen;
    const { complaintId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    const complaint = await Complaint.findOne({
      complaintId,
      'user.phoneNumber': citizen.phoneNumber,
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
      });
    }

    if (complaint.status !== 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Can only submit feedback for closed complaints',
      });
    }

    if (complaint.feedback?.rating) {
      return res.status(400).json({
        success: false,
        message: 'Feedback already submitted',
      });
    }

    complaint.feedback = {
      rating,
      comment,
      submittedAt: new Date(),
    };

    await complaint.save();

    res.json({
      success: true,
      message: 'Thank you for your feedback!',
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
    });
  }
};

/**
 * Logout
 */
exports.logout = async (req, res) => {
  try {
    const citizen = req.citizen;
    const token = req.token;

    citizen.invalidateSession(token);
    await citizen.save();

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout',
    });
  }
};

/**
 * Register push subscription
 */
exports.registerPushSubscription = async (req, res) => {
  try {
    const citizen = req.citizen;
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription data',
      });
    }

    // Check if subscription already exists
    const exists = citizen.pushSubscriptions.some(
      s => s.endpoint === subscription.endpoint
    );

    if (!exists) {
      citizen.pushSubscriptions.push({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      });
      await citizen.save();
    }

    res.json({
      success: true,
      message: 'Push subscription registered',
    });
  } catch (error) {
    console.error('Register push subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register push subscription',
    });
  }
};
