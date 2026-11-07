
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    // Check JWT secret
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is missing in backend environment variables');

      return res.status(500).json({
        message: 'Server authentication configuration error',
      });
    }

    // Verify token
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload.sub) {
      return res.status(401).json({
        message: 'Invalid authentication token',
      });
    }

    // Find active employee
    const result = await query(
      `SELECT
        id,
        employee_code,
        name,
        email,
        phone,
        role,
        job_title,
        profile_photo,
        is_active,
        must_change_password
       FROM users
       WHERE id = $1
       AND deleted_at IS NULL`,
      [payload.sub]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({
        message: 'Account unavailable',
      });
    }

    // Attach authenticated user
    req.user = user;

    return next();

  } catch (error) {
    console.error('Authentication error:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Session expired. Please login again.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid authentication token',
      });
    }

    return res.status(401).json({
      message: 'Authentication failed',
    });
  }
}

// Admin authorization
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required',
    });
  }

  return next();
}
