
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router();

// Upload directory
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// GET /api/files/:filename
// Authenticated employees can access their own documents.
// Admins can access all employee documents.
router.get('/:filename', authenticate, async (req, res) => {
  try {
    // Validate filename
    const filename = path.basename(req.params.filename);

    if (
      !filename ||
      filename !== req.params.filename ||
      filename.includes('..')
    ) {
      return res.status(400).json({
        message: 'Invalid filename',
      });
    }

    // Find matching employee document
    const documents = await query(
      `SELECT employee_id, storage_path
       FROM employee_documents
       WHERE storage_path IS NOT NULL
       AND storage_path LIKE $1`,
      [`%${filename}`]
    );

    // Find matching profile photo
    const photos = await query(
      `SELECT id AS employee_id, profile_photo AS storage_path
       FROM users
       WHERE profile_photo IS NOT NULL
       AND profile_photo LIKE $1`,
      [`%${filename}`]
    );

    const matchingRecords = [
      ...documents.rows,
      ...photos.rows,
    ];

    if (matchingRecords.length === 0) {
      return res.status(404).json({
        message: 'Document record not found',
      });
    }

    // Admin can access all files.
    // Employees can access only their own files.
    const isAdmin = req.user.role === 'admin';

    const hasAccess =
      isAdmin ||
      matchingRecords.some(
        record => String(record.employee_id) === String(req.user.id)
      );

    if (!hasAccess) {
      return res.status(403).json({
        message: 'You do not have permission to access this file',
      });
    }

    // Resolve file path safely
    const fullPath = path.resolve(UPLOAD_DIR, filename);

    if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) {
      return res.status(400).json({
        message: 'Invalid file path',
      });
    }

    // Check file existence
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        message: 'Uploaded file not found on server',
      });
    }

    // Check that the path is a regular file
    const stats = fs.statSync(fullPath);

    if (!stats.isFile()) {
      return res.status(400).json({
        message: 'Invalid file',
      });
    }

    // Set safe response headers
    const extension = path.extname(filename).toLowerCase();

    const contentTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };

    res.setHeader(
      'Content-Type',
      contentTypes[extension] || 'application/octet-stream'
    );

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/["\\]/g, '_')}"`
    );

    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Send file
    return res.sendFile(fullPath);

  } catch (error) {
    console.error('File access error:', error);

    return res.status(500).json({
      message: 'Unable to access file',
    });
  }
});

export default router;
