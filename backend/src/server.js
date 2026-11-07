
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

// ==========================================
// APPLICATION CONFIGURATION
// ==========================================

const app = express();
const PORT = process.env.PORT || 5000;

// Render runs behind a reverse proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ==========================================
// ALLOWED FRONTEND DOMAINS
// ==========================================

const defaultOrigins = [
  'http://localhost:5173',
  'https://employeeportalvyntara.netlify.app',
  'https://employee.vyntaralabs.tech'
];

const environmentOrigins = (
  process.env.CLIENT_ORIGIN || ''
)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  ...new Set([
    ...defaultOrigins,
    ...environmentOrigins
  ].map(origin => origin.replace(/\/$/, '')))
];

console.log('Allowed frontend origins:', allowedOrigins);

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);

// ==========================================
// CORS CONFIGURATION
// ==========================================

const corsOptions = {
  origin(origin, callback) {
    // Allow requests without an Origin header,
    // such as server-to-server requests.
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/$/, '');

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    console.warn('Blocked CORS origin:', origin);

    return callback(
      new Error(`CORS blocked origin: ${origin}`)
    );
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization'
  ],

  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Explicitly handle preflight requests.
app.options(/.*/, cors(corsOptions));

// ==========================================
// REQUEST BODY CONFIGURATION
// ==========================================

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
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.'
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
    service: 'Vyntara Employee Portal',
    status: 'OK',
    frontend: [
      'https://employee.vyntaralabs.tech',
      'https://employeeportalvyntara.netlify.app'
    ]
  });
});

// ==========================================
// API ROOT
// ==========================================

app.get('/api', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Vyntara API is available',
    health: '/api/health'
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
// AUTHENTICATION ROUTES
// ==========================================

app.use('/api/auth', authRoutes);

// ==========================================
// EMPLOYEE ROUTES
// ==========================================

app.use('/api/employee', employeeRoutes);

// ==========================================
// ADMIN ROUTES
// ==========================================

app.use('/api/admin', adminRoutes);

// ==========================================
// FILE ROUTES
// ==========================================

app.use('/api/files', fileRoutes);

// ==========================================
// API NOT FOUND
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
  console.log('========================================');
  console.log('VYNTARA EMPLOYEE PORTAL API');
  console.log('========================================');
  console.log(`Server running on port: ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Allowed origins:');

  allowedOrigins.forEach(origin => {
    console.log(`- ${origin}`);
  });

  console.log('========================================');
});
