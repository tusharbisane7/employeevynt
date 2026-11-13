// backend/src/routes/files.routes.js

import { Router } from 'express';
import axios from 'axios';

import cloudinary from '../config/cloudinary.js';
import { authenticate } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router();

/* =========================================
   CLOUDINARY URL HELPER
========================================= */

function getAuthenticatedCloudinaryUrl(publicId, resourceType) {
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true
  });
}

/* =========================================
   FILE STREAM HELPER
========================================= */

async function streamCloudinaryFile({
  publicId,
  resourceType,
  contentType,
  filename,
  res
}) {
  const cloudinaryUrl = getAuthenticatedCloudinaryUrl(
    publicId,
    resourceType
  );

  const response = await axios.get(cloudinaryUrl, {
    responseType: 'stream',
    timeout: 30000,
    maxRedirects: 3,
    validateStatus: status => status === 200
  });

  res.setHeader(
    'Content-Type',
    contentType || response.headers['content-type'] ||
      'application/octet-stream'
  );

  if (filename) {
    const safeFilename = filename.replace(/["\\\r\n]/g, '_');

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${safeFilename}"`
    );
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  response.data.on('error', error => {
    console.error('Cloudinary stream error:', error);

    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        message: 'Unable to retrieve file from storage.'
      });
    } else {
      res.destroy(error);
    }
  });

  return response.data.pipe(res);
}

/* =========================================
   GET EMPLOYEE DOCUMENT
   GET /api/files/document/:id
========================================= */

router.get('/document/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT
          d.id,
          d.employee_id,
          d.file_name,
          d.storage_path
       FROM employee_documents d
       INNER JOIN users u ON u.id = d.employee_id
       WHERE d.id = $1
         AND u.deleted_at IS NULL`,
      [req.params.id]
    );

    const document = result.rows[0];

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.'
      });
    }

    const isAdmin = req.user.role === 'admin';
    const isOwner =
      String(document.employee_id) === String(req.user.id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this document.'
      });
    }

    const publicId = String(document.storage_path || '').trim();

    if (
      !publicId ||
      publicId.startsWith('/api/') ||
      publicId.startsWith('uploads/') ||
      publicId.startsWith('http://') ||
      publicId.startsWith('https://')
    ) {
      return res.status(410).json({
        success: false,
        message: 'This document uses legacy storage. Please ask an admin to re-upload it.'
      });
    }

    return await streamCloudinaryFile({
      publicId,
      resourceType: 'raw',
      contentType: 'application/pdf',
      filename: document.file_name || `document-${document.id}.pdf`,
      res
    });
  } catch (error) {
    console.error(
      'Document access error:',
      error.response?.status || error.message
    );

    if (res.headersSent) {
      return res.destroy();
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Document not found in Cloudinary.'
      });
    }

    if (
      error.response?.status === 401 ||
      error.response?.status === 403
    ) {
      return res.status(502).json({
        success: false,
        message: 'Cloudinary rejected the document request. Check asset access settings.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to access document.'
    });
  }
});

/* =========================================
   GET EMPLOYEE PROFILE PHOTO
   GET /api/files/profile/:employeeId
========================================= */

router.get('/profile/:employeeId', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const isOwner =
      String(req.params.employeeId) === String(req.user.id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this profile photo.'
      });
    }

    const result = await query(
      `SELECT id, profile_photo
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL`,
      [req.params.employeeId]
    );

    const employee = result.rows[0];

    if (!employee || !employee.profile_photo) {
      return res.status(404).json({
        success: false,
        message: 'Profile photo not found.'
      });
    }

    const publicId = String(employee.profile_photo).trim();

    if (
      publicId.startsWith('/api/') ||
      publicId.startsWith('uploads/') ||
      publicId.startsWith('http://') ||
      publicId.startsWith('https://')
    ) {
      return res.status(410).json({
        success: false,
        message: 'This profile photo uses legacy storage.'
      });
    }

    return await streamCloudinaryFile({
      publicId,
      resourceType: 'image',
      contentType: undefined,
      filename: `profile-${employee.id}`,
      res
    });
  } catch (error) {
    console.error(
      'Profile photo access error:',
      error.response?.status || error.message
    );

    if (res.headersSent) {
      return res.destroy();
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Profile photo not found in Cloudinary.'
      });
    }

    if (
      error.response?.status === 401 ||
      error.response?.status === 403
    ) {
      return res.status(502).json({
        success: false,
        message: 'Cloudinary rejected the profile photo request.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to access profile photo.'
    });
  }
});

export default router;