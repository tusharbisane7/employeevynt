
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';

import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
const MAX_PDF_SIZE = 300 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// All employee routes require authentication.
router.use(authenticate);

/* =========================================
   PDF UPLOAD CONFIGURATION
========================================= */

const pdfUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_PDF_SIZE,
    files: 1
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (
      extension !== '.pdf' ||
      file.mimetype !== 'application/pdf'
    ) {
      return callback(
        new Error('Only PDF files are allowed.')
      );
    }

    callback(null, true);
  }
});

// Handle Multer errors with readable API responses.
function handlePdfUpload(req, res, next) {
  pdfUpload.single('document')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'PDF file must be 300 KB or smaller.'
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || 'Invalid document upload.'
    });
  });
}

/* =========================================
   EMPLOYEE DASHBOARD
========================================= */

router.get('/dashboard', async (req, res) => {
  try {
    const employeeId = req.user.id;

    const [projects, documents, verificationDocuments] =
      await Promise.all([

        // Assigned projects and manager information.
        query(
          `SELECT
              p.id,
              p.project_name,
              p.description,
              p.status,
              p.start_date,
              p.deadline,
              m.id AS manager_id,
              m.name AS manager_name,
              m.role_title AS manager_role,
              m.email AS manager_email,
              m.phone AS manager_phone
           FROM project_members pm
           INNER JOIN projects p
              ON p.id = pm.project_id
           LEFT JOIN managers m
              ON m.id = p.manager_id
           WHERE pm.employee_id = $1
           ORDER BY p.deadline ASC`,
          [employeeId]
        ),

        // Existing employment documents.
        query(
          `SELECT
              id,
              document_type,
              title,
              file_name,
              storage_path,
              uploaded_at
           FROM employee_documents
           WHERE employee_id = $1
           AND document_type NOT IN (
             'identity_proof',
             'educational_proof',
             'residential_proof'
           )
           ORDER BY uploaded_at DESC`,
          [employeeId]
        ),

        // Employee verification documents.
        query(
          `SELECT
              id,
              document_type,
              title,
              file_name,
              storage_path,
              uploaded_at
           FROM employee_documents
           WHERE employee_id = $1
           AND document_type IN (
             'identity_proof',
             'educational_proof',
             'residential_proof'
           )
           ORDER BY uploaded_at DESC`,
          [employeeId]
        )
      ]);

    return res.status(200).json({
      success: true,
      projects: projects.rows,
      documents: documents.rows,
      verificationDocuments: verificationDocuments.rows
    });

  } catch (error) {
    console.error('Employee dashboard error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load employee dashboard'
    });
  }
});

/* =========================================
   EMPLOYEE PROFILE
========================================= */

router.get('/profile', async (req, res) => {
  try {
    const result = await query(
      `SELECT
          id,
          employee_code,
          name,
          email,
          phone,
          role,
          job_title,
          date_of_joining,
          date_of_expiry,
          profile_photo
       FROM users
       WHERE id = $1
       AND deleted_at IS NULL`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found'
      });
    }

    return res.status(200).json({
      success: true,
      profile: result.rows[0]
    });

  } catch (error) {
    console.error('Employee profile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load employee profile'
    });
  }
});

/* =========================================
   UPLOAD PROFILE PHOTO
========================================= */

router.post(
  '/profile/photo',
  imageUpload.single('photo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Upload a JPG, PNG or WEBP image (maximum 5 MB)'
        });
      }

      const photo = `/api/files/${path.basename(req.file.path)}`;

      const result = await query(
        `UPDATE users
         SET profile_photo = $1,
             updated_at = NOW()
         WHERE id = $2
         AND deleted_at IS NULL
         RETURNING profile_photo`,
        [photo, req.user.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Employee account not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Profile photo updated successfully',
        profile_photo: result.rows[0].profile_photo
      });

    } catch (error) {
      console.error('Profile photo upload error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to upload profile photo'
      });
    }
  }
);

/* =========================================
   EMPLOYEE VERIFICATION DOCUMENTS
========================================= */

// GET /api/employee/verification-documents
// Employee can view only their own submissions.

router.get('/verification-documents', async (req, res) => {
  try {
    const result = await query(
      `SELECT
          id,
          document_type,
          title,
          file_name,
          storage_path,
          uploaded_at
       FROM employee_documents
       WHERE employee_id = $1
       AND document_type IN (
         'identity_proof',
         'educational_proof',
         'residential_proof'
       )
       ORDER BY uploaded_at DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      documents: result.rows
    });

  } catch (error) {
    console.error('Verification document fetch error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load verification documents'
    });
  }
});

/* =========================================
   UPLOAD VERIFICATION DOCUMENT
========================================= */

// POST /api/employee/verification-documents
//
// Content-Type: multipart/form-data
//
// Fields:
// documentType = identity_proof | educational_proof | residential_proof
// document     = PDF file
//
// Maximum file size: 300 KB.

router.post(
  '/verification-documents',
  handlePdfUpload,
  async (req, res) => {

    let savedFilePath = null;

    try {
      const employeeId = req.user.id;
      const { documentType } = req.body;

      const allowedTypes = {
        identity_proof: 'Identity Proof',
        educational_proof: 'Educational Proof',
        residential_proof: 'Residential Proof'
      };

      // Validate document category.
      if (!allowedTypes[documentType]) {
        return res.status(400).json({
          success: false,
          message: 'Select a valid document category.'
        });
      }

      // Validate file presence.
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please select a PDF document.'
        });
      }

      // Validate actual file size.
      if (req.file.size > MAX_PDF_SIZE) {
        return res.status(400).json({
          success: false,
          message: 'PDF file must be 300 KB or smaller.'
        });
      }

      // Validate the actual PDF signature.
      const pdfSignature = req.file.buffer
        .subarray(0, 5)
        .toString('ascii');

      if (pdfSignature !== '%PDF-') {
        return res.status(400).json({
          success: false,
          message: 'The selected file is not a valid PDF.'
        });
      }

      // Create a unique server-side filename.
      const filename = `employee-${randomUUID()}.pdf`;

      savedFilePath = path.join(UPLOAD_DIR, filename);

      // Save file only after validation.
      await fs.promises.writeFile(
        savedFilePath,
        req.file.buffer,
        { flag: 'wx' }
      );

      const title = allowedTypes[documentType];

      // Save document information in PostgreSQL.
      const result = await query(
        `INSERT INTO employee_documents (
            employee_id,
            document_type,
            title,
            file_name,
            storage_path,
            uploaded_at
         )
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING
            id,
            document_type,
            title,
            file_name,
            storage_path,
            uploaded_at`,
        [
          employeeId,
          documentType,
          title,
          path.basename(req.file.originalname),
          filename
        ]
      );

      return res.status(201).json({
        success: true,
        message: `${title} uploaded successfully.`,
        document: result.rows[0]
      });

    } catch (error) {
      // Remove the physical file if database insertion fails.
      if (savedFilePath) {
        try {
          await fs.promises.unlink(savedFilePath);
        } catch (cleanupError) {
          console.error('Uploaded file cleanup error:', cleanupError);
        }
      }

      console.error('Verification document upload error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to upload verification document.'
      });
    }
  }
);

export default router;
