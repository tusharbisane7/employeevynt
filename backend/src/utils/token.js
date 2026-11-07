import jwt from 'jsonwebtoken';
export const makeToken = (user) => jwt.sign(
  { sub: user.id, role: user.role }, process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
);
