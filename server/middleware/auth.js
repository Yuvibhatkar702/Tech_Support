const jwt = require('jsonwebtoken');
const config = require('../config');
const Admin = require('../models/Admin');

/**
 * Generate a fresh JWT for sliding session refresh
 */
const generateRefreshToken = (decoded) => {
  return jwt.sign(
    { id: decoded.id, email: decoded.email, role: decoded.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } // 5m
  );
};

/**
 * Authentication middleware for protected routes
 * Validates JWT, refreshes token (sliding session), attaches admin to request.
 */
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      
      const admin = await Admin.findOne({
        _id: decoded.id,
        isActive: true,
      });

      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token or account disabled.',
        });
      }

      // Role mismatch guard — prevent cross-portal token reuse
      if (decoded.role && decoded.role !== admin.role) {
        return res.status(401).json({
          success: false,
          message: 'Token role mismatch. Please login again.',
        });
      }

      req.admin = admin;
      req.token = token;

      // ── Sliding session: issue a fresh token on every valid request ──
      const freshToken = generateRefreshToken(decoded);
      res.setHeader('x-refresh-token', freshToken);

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please login again.',
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.',
    });
  }
};

/**
 * Role-based access control middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated.',
      });
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this resource.',
      });
    }

    next();
  };
};

/**
 * Permission-based access control middleware
 */
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated.',
      });
    }

    // Super admin has all permissions
    if (req.admin.role === 'super_admin') {
      return next();
    }

    if (!req.admin.permissions[permission]) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      const admin = await Admin.findOne({
        _id: decoded.id,
        isActive: true,
      });

      if (admin) {
        req.admin = admin;
        req.token = token;
        // Sliding refresh
        const freshToken = generateRefreshToken(decoded);
        res.setHeader('x-refresh-token', freshToken);
      }
    } catch (error) {
      // Ignore token errors for optional auth
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  auth,
  authorize,
  checkPermission,
  optionalAuth,
};
