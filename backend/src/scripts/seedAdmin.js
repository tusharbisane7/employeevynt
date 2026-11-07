import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, pool } from '../config/db.js';

try {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  const existing = await query("SELECT id FROM users WHERE LOWER(email)=LOWER($1)", [email]);
  if (existing.rows.length) {
    console.log('Admin already exists; no changes made.');
  } else {
    const hash = await bcrypt.hash(password, 12);
    await query(`INSERT INTO users(name,email,phone,password_hash,role,job_title,date_of_joining,must_change_password)
      VALUES('Vyntara Administrator',$1,'Not provided',$2,'admin','Administrator',CURRENT_DATE,FALSE)`, [email,hash]);
    console.log(`Admin created: ${email}`);
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await pool.end(); }
