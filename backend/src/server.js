import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { pool } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import adminRoutes from './routes/admin.routes.js';
import fileRoutes from './routes/files.routes.js';

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, limit: 20 }));
app.get('/api/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({ status:'ok', service:'Vyntara Employee Portal API' }); }
  catch { res.status(500).json({ status:'error' }); }
});
app.use('/api/auth', authRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/files', fileRoutes);
app.use((err,_req,res,_next) => {
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error' });
});
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Vyntara API running on ${port}`));
