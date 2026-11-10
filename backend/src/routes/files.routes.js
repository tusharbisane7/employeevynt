
import { Router } from 'express';
import path from 'path';
import fs from 'fs';

import { authenticate } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// GET /api/files/:filename
//
// Admin can access all employee files.
// Employees can access only their own files.

router.get('/:filename', authenticate, async (req, res) => {
  try {
    const filename = req.params.filename;

    // Validate filename and prevent path traversal.
    if (
      !filename ||
      filename !== path.basename(filename) ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    // Find matching employment documents.
    const documents = await query(
      `SELECT
          employee_id,
          storage_path
       FROM employee_documents
       WHERE storage_path IS NOT NULL
       AND storage_path LIKE $1`,
      [`%${filename}`]
    );

    // Find matching employee profile photos.
    const photos = await query(
      `SELECT
          id AS employee_id,
          profile_photo AS storage_path
       FROM users
       WHERE profile_photo IS NOT NULL
       AND profile_photo LIKE $1`,
      [`%${filename}`]
    );

    const matchingRecords = [
      ...documents.rows,
      ...photos.rows
    ];

    // No matching database record.
    if (matchingRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File record not found'
      });
    }

    // Admin has access to all files.
    // Employees have access only to their own files.
    const isAdmin = req.user.role === 'admin';

    const hasAccess =
      isAdmin ||
      matchingRecords.some(
        record =>
          String(record.employee_id) === String(req.user.id)
      );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this file'
      });
    }

    // Resolve file path safely.
    const fullPath = path.resolve(UPLOAD_DIR, filename);

    if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file path'
      });
    }

    // Verify that the file exists.
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        message: 'Uploaded file not found on server'
      });
    }

    const stats = fs.statSync(fullPath);

    if (!stats.isFile()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file'
      });
    }

    // Supported file types.
    const extension = path.extname(filename).toLowerCase();

    const contentTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
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

    res.setHeader('Cache-Control', 'private, no-store');

    // Send authenticated file.
    return res.sendFile(fullPath);

  } catch (error) {
    console.error('File access error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to access file'
    });
  }
});

export default router;
