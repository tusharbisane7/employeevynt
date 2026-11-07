import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000
});
export const query = (text, params) => pool.query(text, params);
