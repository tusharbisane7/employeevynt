
import { Router } from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';

import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';

import {
  uploadPdf,
  uploadImage,
  deleteCloudinaryFile
} from '../utils/cloudinaryUpload.js';

const router = Router();

const MAX_PDF_SIZE = 300 * 1024;

// All employee routes require authentication.
router.use(authenticate);

// Employee-only middleware.
function requireEmployee(req, res, next) {
  if (req.user?.role !== 'employee') {
    return res.status(403).json({
      success: false,
      message: 'Employee access required.'
    });
  }

  next();
}

/*
|--------------------------------------------------------------------------
| PDF UPLOAD CONFIGURATION
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| CLOUDINARY CLEANUP HELPER
|--------------------------------------------------------------------------
*/

async function cleanupCloudinaryFile(publicId, resourceType) {
  if (!publicId) return;

  try {
    await deleteCloudinaryFile(publicId, resourceType);
  } catch (error) {
    console.error('Cloudinary cleanup error:', error.message);
  }
}

/*
|--------------------------------------------------------------------------
| EMPLOYEE DASHBOARD
|--------------------------------------------------------------------------
*/

router.get('/dashboard', async (req, res) => {
  try {
    const employeeId = req.user.id;

    const [
      projects,
      documents,
      verificationDocuments
    ] = await Promise.all([
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

      query(
        `SELECT
            id,
            document_type,
            title,
            file_name,
            '/api/files/document/' || id::text AS storage_path,
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

      query(
        `SELECT
            id,
            document_type,
            title,
            file_name,
            '/api/files/document/' || id::text AS storage_path,
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
      message: 'Unable to load employee dashboard.'
    });
  }
});

/*
|--------------------------------------------------------------------------
| EMPLOYEE PROFILE
|--------------------------------------------------------------------------
*/

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
        message: 'Employee profile not found.'
      });
    }

    const profile = result.rows[0];

    // Return an authenticated API path rather than a Cloudinary ID.
    profile.profile_photo = profile.profile_photo
      ? `/api/files/profile/${profile.id}`
      : null;

    return res.status(200).json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('Employee profile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load employee profile.'
    });
  }
});

/*
|--------------------------------------------------------------------------
| UPLOAD PROFILE PHOTO
|--------------------------------------------------------------------------
|
| Multer memory storage -> Cloudinary -> PostgreSQL
|
*/

router.post(
  '/profile/photo',
  imageUpload.single('photo'),
  async (req, res) => {
    let uploadedPublicId = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Upload a JPG, PNG or WEBP image (maximum 5 MB).'
        });
      }

      // Upload the new image to Cloudinary.
      const uploaded = await uploadImage(req.file);

      uploadedPublicId = uploaded.public_id;

      // Find the current photo so it can be cleaned up later.
      const previousResult = await query(
        `SELECT profile_photo
         FROM users
         WHERE id = $1
           AND deleted_at IS NULL`,
        [req.user.id]
      );

      if (!previousResult.rows.length) {
        await cleanupCloudinaryFile(uploadedPublicId, 'image');

        return res.status(404).json({
          success: false,
          message: 'Employee account not found.'
        });
      }

      const oldPublicId = previousResult.rows[0].profile_photo;

      // Save the Cloudinary public ID in PostgreSQL.
      const result = await query(
        `UPDATE users
         SET profile_photo = $1,
             updated_at = NOW()
         WHERE id = $2
           AND deleted_at IS NULL
         RETURNING id, profile_photo`,
        [uploadedPublicId, req.user.id]
      );

      if (!result.rows.length) {
        await cleanupCloudinaryFile(uploadedPublicId, 'image');

        return res.status(404).json({
          success: false,
          message: 'Employee account not found.'
        });
      }

      // Delete the old Cloudinary image after the DB update.
      // Do not attempt to delete old local paths or URLs.
      if (
        oldPublicId &&
        oldPublicId !== uploadedPublicId &&
        !String(oldPublicId).startsWith('/api/files/') &&
        !String(oldPublicId).startsWith('http')
      ) {
        await cleanupCloudinaryFile(oldPublicId, 'image');
      }

      return res.status(200).json({
        success: true,
        message: 'Profile photo updated successfully.',
        profile_photo: `/api/files/profile/${req.user.id}`
      });

    } catch (error) {
      if (uploadedPublicId) {
        await cleanupCloudinaryFile(uploadedPublicId, 'image');
      }

      console.error('Profile photo upload error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to upload profile photo.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| VERIFICATION DOCUMENTS
|--------------------------------------------------------------------------
*/

// GET employee verification documents.

router.get('/verification-documents', async (req, res) => {
  try {
    const result = await query(
      `SELECT
          id,
          document_type,
          title,
          file_name,
          '/api/files/document/' || id::text AS storage_path,
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
      message: 'Unable to load verification documents.'
    });
  }
});

/*
|--------------------------------------------------------------------------
| UPLOAD VERIFICATION DOCUMENT
|--------------------------------------------------------------------------
|
| PDF -> Multer memory storage -> Cloudinary -> PostgreSQL
|
*/

router.post(
  '/verification-documents',
  handlePdfUpload,
  async (req, res) => {
    let uploadedPublicId = null;

    try {
      const employeeId = req.user.id;
      const { documentType } = req.body;

      const allowedTypes = {
        identity_proof: 'Identity Proof',
        educational_proof: 'Educational Proof',
        residential_proof: 'Residential Proof'
      };

      if (!allowedTypes[documentType]) {
        return res.status(400).json({
          success: false,
          message: 'Select a valid document category.'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please select a PDF document.'
        });
      }

      if (req.file.size > MAX_PDF_SIZE) {
        return res.status(400).json({
          success: false,
          message: 'PDF file must be 300 KB or smaller.'
        });
      }

      // Verify PDF file signature.
      const pdfSignature = req.file.buffer
        .subarray(0, 5)
        .toString('ascii');

      if (pdfSignature !== '%PDF-') {
        return res.status(400).json({
          success: false,
          message: 'The selected file is not a valid PDF.'
        });
      }

      const title = allowedTypes[documentType];

      // Upload PDF directly to Cloudinary.
      const uploaded = await uploadPdf(req.file);

      uploadedPublicId = uploaded.public_id;

      // Save Cloudinary public ID in PostgreSQL.
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
            uploaded_at`,
        [
          employeeId,
          documentType,
          title,
          path.basename(req.file.originalname),
          uploadedPublicId
        ]
      );

      const document = result.rows[0];

      return res.status(201).json({
        success: true,
        message: `${title} uploaded successfully.`,
        document: {
          ...document,
          storage_path: `/api/files/document/${document.id}`
        }
      });

    } catch (error) {
      // If DB insertion fails, remove the newly uploaded Cloudinary file.
      if (uploadedPublicId) {
        await cleanupCloudinaryFile(uploadedPublicId, 'raw');
      }

      console.error('Verification document upload error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to upload verification document.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| EMPLOYEE LOGIN ACTIVITY
|--------------------------------------------------------------------------
*/

// CREATE LOGIN ACTIVITY.
// POST /api/employee/login-activity

router.post('/login-activity', requireEmployee, async (req, res) => {
  try {
    const allowedInitialStatuses = [
      'not_asked',
      'denied',
      'unavailable'
    ];

    const requestedStatus = req.body?.locationStatus || 'not_asked';

    const locationStatus = allowedInitialStatuses.includes(requestedStatus)
      ? requestedStatus
      : 'not_asked';

    const result = await query(
      `INSERT INTO employee_login_activity (
          employee_id,
          location_status,
          user_agent
       )
       SELECT
          id,
          $2,
          $3
       FROM users
       WHERE id = $1
         AND role = 'employee'
         AND is_active = TRUE
         AND deleted_at IS NULL
       RETURNING
          id,
          employee_id,
          logged_in_at,
          location_status`,
      [
        req.user.id,
        locationStatus,
        req.get('user-agent') || null
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Active employee account not found.'
      });
    }

    return res.status(201).json({
      success: true,
      activity: result.rows[0]
    });

  } catch (error) {
    console.error('Login activity creation error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to record login activity.'
    });
  }
});

// EMPLOYEE'S OWN LAST FIVE LOGIN RECORDS.
// GET /api/employee/login-activity/me

router.get('/login-activity/me', requireEmployee, async (req, res) => {
  try {
    const result = await query(
      `SELECT
          id AS activity_id,
          employee_id,
          logged_in_at,
          ended_at,
          location_status,
          latitude,
          longitude,
          accuracy,
          location_updated_at
       FROM employee_login_activity
       WHERE employee_id = $1
       ORDER BY logged_in_at DESC
       LIMIT 5`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      activities: result.rows
    });

  } catch (error) {
    console.error('Employee login history error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load your login history.'
    });
  }
});

// UPDATE LOCATION SHARING STATUS.
// PATCH /api/employee/login-activity/:id/location-status

router.patch(
  '/login-activity/:id/location-status',
  requireEmployee,
  async (req, res) => {
    try {
      const allowedStatuses = [
        'denied',
        'unavailable',
        'stopped'
      ];

      const { status } = req.body || {};

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid location status.'
        });
      }

      const result = await query(
        `UPDATE employee_login_activity
         SET location_status = $1
         WHERE id = $2
           AND employee_id = $3
           AND ended_at IS NULL
         RETURNING
            id,
            location_status`,
        [
          status,
          req.params.id,
          req.user.id
        ]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Active login activity not found.'
        });
      }

      return res.status(200).json({
        success: true,
        activity: result.rows[0]
      });

    } catch (error) {
      console.error('Location status update error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to update location status.'
      });
    }
  }
);

// SAVE BROWSER GPS LOCATION.
// POST /api/employee/login-activity/:id/location

router.post(
  '/login-activity/:id/location',
  requireEmployee,
  async (req, res) => {
    try {
      const {
        latitude,
        longitude,
        accuracy
      } = req.body || {};

      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          message: 'Valid GPS coordinates are required.'
        });
      }

      const safeAccuracy =
        typeof accuracy === 'number' &&
        Number.isFinite(accuracy) &&
        accuracy >= 0
          ? accuracy
          : null;

      const result = await query(
        `UPDATE employee_login_activity
         SET
            latitude = $1,
            longitude = $2,
            accuracy = $3,
            location_status = 'shared',
            location_updated_at = NOW()
         WHERE id = $4
           AND employee_id = $5
           AND ended_at IS NULL
           AND location_status <> 'stopped'
         RETURNING
            id,
            latitude,
            longitude,
            accuracy,
            location_status,
            location_updated_at`,
        [
          latitude,
          longitude,
          safeAccuracy,
          req.params.id,
          req.user.id
        ]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Active login activity not found or location sharing has been stopped.'
        });
      }

      return res.status(200).json({
        success: true,
        location: result.rows[0]
      });

    } catch (error) {
      console.error('Employee location update error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to update employee location.'
      });
    }
  }
);

// END LOGIN SESSION.
// POST /api/employee/login-activity/:id/end

router.post(
  '/login-activity/:id/end',
  requireEmployee,
  async (req, res) => {
    try {
      const result = await query(
        `UPDATE employee_login_activity
         SET ended_at = COALESCE(ended_at, NOW())
         WHERE id = $1
           AND employee_id = $2
         RETURNING id, ended_at`,
        [
          req.params.id,
          req.user.id
        ]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Login activity not found.'
        });
      }

      return res.status(200).json({
        success: true,
        activity: result.rows[0]
      });

    } catch (error) {
      console.error('Login activity end error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to end login activity.'
      });
    }
  }
);

export default router;
