
import { Router } from 'express';
import path from 'path';
import axios from 'axios';

import cloudinary from '../config/cloudinary.js';
import { authenticate } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router();

/*
|--------------------------------------------------------------------------
| FILE CONFIGURATION
|--------------------------------------------------------------------------
*/

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

/*
|--------------------------------------------------------------------------
| VALIDATE FILENAME
|--------------------------------------------------------------------------
*/

function isValidFilename(filename) {
  return (
    typeof filename === 'string' &&
    filename.length > 0 &&
    filename.length <= 255 &&
    filename === path.basename(filename) &&
    !filename.includes('..') &&
    !filename.includes('/') &&
    !filename.includes('\\')
  );
}

/*
|--------------------------------------------------------------------------
| GET CLOUDINARY URL
|--------------------------------------------------------------------------
|
| storage_path must contain the Cloudinary public_id.
|
| resource_type:
| - image: profile photos
| - raw: PDFs, DOCX, XLSX and other documents
|
| Cloudinary assets must have been uploaded using:
| type: 'authenticated'
|
*/

function getAuthenticatedCloudinaryUrl(publicId, resourceType) {
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true
  });
}

/*
|--------------------------------------------------------------------------
| GET /api/files/:filename
|--------------------------------------------------------------------------
|
| Admin can access all employee files.
| Employees can access only their own files.
|
*/

router.get('/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params;

    if (!isValidFilename(filename)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FIND EMPLOYEE DOCUMENTS
    |--------------------------------------------------------------------------
    */

    const documentsResult = await query(
      `SELECT
          employee_id,
          storage_path
       FROM employee_documents
       WHERE storage_path IS NOT NULL
       AND storage_path LIKE $1`,
      [`%${filename}%`]
    );

    /*
    |--------------------------------------------------------------------------
    | FIND PROFILE PHOTOS
    |--------------------------------------------------------------------------
    */

    const photosResult = await query(
      `SELECT
          id AS employee_id,
          profile_photo AS storage_path
       FROM users
       WHERE profile_photo IS NOT NULL
       AND profile_photo LIKE $1`,
      [`%${filename}%`]
    );

    const documentRecords = documentsResult.rows.map(record => ({
      ...record,
      resource_type: 'raw'
    }));

    const photoRecords = photosResult.rows.map(record => ({
      ...record,
      resource_type: 'image'
    }));

    const matchingRecords = [
      ...documentRecords,
      ...photoRecords
    ];

    if (matchingRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File record not found'
      });
    }

    /*
    |--------------------------------------------------------------------------
    | CHECK USER PERMISSIONS
    |--------------------------------------------------------------------------
    */

    const isAdmin = req.user.role === 'admin';

    const authorizedRecords = matchingRecords.filter(record => {
      return (
        isAdmin ||
        String(record.employee_id) === String(req.user.id)
      );
    });

    if (authorizedRecords.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this file'
      });
    }

    /*
    |--------------------------------------------------------------------------
    | GET CLOUDINARY PUBLIC ID
    |--------------------------------------------------------------------------
    */

    const record = authorizedRecords[0];

    let publicId = String(record.storage_path || '').trim();

    // Remove a possible leading slash.
    publicId = publicId.replace(/^\/+/, '');

    if (!publicId) {
      return res.status(404).json({
        success: false,
        message: 'Cloudinary file reference is missing'
      });
    }

    /*
    |--------------------------------------------------------------------------
    | GENERATE AUTHENTICATED CLOUDINARY URL
    |--------------------------------------------------------------------------
    */

    const cloudinaryUrl = getAuthenticatedCloudinaryUrl(
      publicId,
      record.resource_type
    );

    /*
    |--------------------------------------------------------------------------
    | FETCH FILE FROM CLOUDINARY
    |--------------------------------------------------------------------------
    */

    const response = await axios.get(cloudinaryUrl, {
      responseType: 'stream',
      timeout: 30000,
      maxRedirects: 3,
      validateStatus: status => status === 200
    });

    /*
    |--------------------------------------------------------------------------
    | CONTENT TYPE
    |--------------------------------------------------------------------------
    */

    const extension = path.extname(filename).toLowerCase();

    const contentType =
      CONTENT_TYPES[extension] ||
      response.headers['content-type'] ||
      'application/octet-stream';

    res.setHeader('Content-Type', contentType);

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/["\\]/g, '_')}"`
    );

    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.setHeader('Cache-Control', 'private, no-store');

    /*
    |--------------------------------------------------------------------------
    | STREAM FILE TO USER
    |--------------------------------------------------------------------------
    */

    response.data.on('error', error => {
      console.error('Cloudinary stream error:', error);

      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          message: 'Unable to retrieve file from storage'
        });
      } else {
        res.destroy(error);
      }
    });

    return response.data.pipe(res);

  } catch (error) {
    console.error(
      'File access error:',
      error.response?.status || error.message
    );

    if (res.headersSent) {
      return res.destroy();
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'File not found in Cloudinary'
      });
    }

    if (
      error.response?.status === 401 ||
      error.response?.status === 403
    ) {
      return res.status(502).json({
        success: false,
        message: 'Cloudinary rejected the file request. Check asset access settings.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to access file'
    });
  }
});

export default router;
