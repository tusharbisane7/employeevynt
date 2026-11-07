
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pool } from './config/db.js';

import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import adminRoutes from './routes/admin.routes.js';
import fileRoutes from './routes/files.routes.js';

const app = express();

// ==========================================
// APPLICATION CONFIGURATION
// ==========================================

const PORT = process.env.PORT || 5000;

const allowedOrigins = (
  process.env.CLIENT_ORIGIN ||
  'http://localhost:5173'
)
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server requests and permitted browser origins.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, '');

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked origin: ${origin}`)
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json({ limit: '1mb' }));

// ==========================================
// RATE LIMITING
// ==========================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many login attempts. Please try again later.'
  }
});

app.use('/api/auth/login', loginLimiter);

// ==========================================
// ROOT ROUTE
// ==========================================

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Vyntara Employee Portal API is running',
    status: 'OK'
  });
});

// ==========================================
// DATABASE HEALTH CHECK
// ==========================================

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      success: true,
      status: 'ok',
      service: 'Vyntara Employee Portal API',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database health check failed:', error);

    res.status(503).json({
      success: false,
      status: 'error',
      database: 'disconnected'
    });
  }
});

// ==========================================
// API ROUTES
// ==========================================

app.use('/api/auth', authRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/files', fileRoutes);

// ==========================================
// API 404 HANDLER
// ==========================================

app.use('/api', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((err, _req, res, _next) => {
  console.error('Server error:', err);

  if (err.message?.startsWith('CORS blocked origin:')) {
    return res.status(403).json({
      success: false,
      message: 'Origin not allowed by CORS'
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON request body'
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Unexpected server error'
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================');
  console.log('Vyntara Employee Portal API');
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Allowed origins:', allowedOrigins);
  console.log('====================================');
});
