import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { makeToken } from '../utils/token.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const result = await query(
      `SELECT id, employee_code, name, email, phone, password_hash, role, job_title,
              profile_photo, is_active, must_change_password
       FROM users WHERE LOWER(email)=LOWER($1) AND deleted_at IS NULL`, [email.trim()]
    );
    const user = result.rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password, or account is suspended' });
    }
    const { password_hash, ...safeUser } = user;
    res.json({ token: makeToken(user), user: safeUser });
  } catch (e) { res.status(500).json({ message: 'Login failed' }); }
});

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 10) return res.status(400).json({ message: 'New password must be at least 10 characters' });
  const result = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!result.rows[0] || !(await bcrypt.compare(currentPassword || '', result.rows[0].password_hash))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash=$1, must_change_password=FALSE, password_changed_at=NOW(), updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
  res.json({ message: 'Password updated successfully' });
});
export default router;
