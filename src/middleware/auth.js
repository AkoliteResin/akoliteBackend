const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_this';

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.email = decoded.email;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Role-based authorization middleware
// Pass allowed roles as an array to the middleware factory
const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    // Admin has access to everything
    if (req.userRole === 'Admin') {
      return next();
    }

    // Check if user role is in allowed roles
    if (allowedRoles.includes(req.userRole)) {
      return next();
    }

    return res.status(403).json({ message: 'Insufficient permissions for this action' });
  };
};

const generateToken = (userId, email, role) => {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '24h' });
};

module.exports = { verifyToken, authorizeRole, generateToken, JWT_SECRET };
