// backend/src/routes/admin.routes.js

import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { query } from '../config/db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { pdfUpload } from '../middleware/upload.js';
import {
  uploadPdf,
  deleteCloudinaryFile
} from '../utils/cloudinaryUpload.js';

const router = Router();

// All routes in this file are admin-only.
router.use(authenticate, requireAdmin);

/* =========================================
   ADMIN OVERVIEW
========================================= */

router.get('/overview', async (_req, res) => {
  try {
    const [employees, projects, docs] = await Promise.all([
      query(
        `SELECT
            id,
            employee_code,
            name,
            email,
            phone,
            job_title,
            date_of_joining,
            date_of_expiry,
            is_active,
            must_change_password,
            password_changed_at,
            created_at
         FROM users
         WHERE role = 'employee'
           AND deleted_at IS NULL
         ORDER BY created_at DESC`
      ),

      query(
        `SELECT
            p.*,
            m.name AS manager_name
         FROM projects p
         LEFT JOIN managers m ON m.id = p.manager_id
         ORDER BY p.created_at DESC`
      ),

      query(
        `SELECT
            d.*,
            u.name AS employee_name,
            u.employee_code,
            '/api/files/document/' || d.id::text AS document_url
         FROM employee_documents d
         INNER JOIN users u ON u.id = d.employee_id
         WHERE u.deleted_at IS NULL
         ORDER BY d.uploaded_at DESC
         LIMIT 100`
      )
    ]);

    return res.json({
      success: true,
      employees: employees.rows,
      projects: projects.rows,
      documents: docs.rows
    });
  } catch (error) {
    console.error('Admin overview error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load admin overview.'
    });
  }
});

/* =========================================
   EMPLOYEE MANAGEMENT
========================================= */

// CREATE EMPLOYEE
router.post('/employees', async (req, res) => {
  const {
    name,
    email,
    phone,
    password,
    jobTitle,
    dateOfJoining,
    dateOfExpiry
  } = req.body;

  if (!name || !email || !phone || !password || !dateOfJoining) {
    return res.status(400).json({
      message: 'Name, email, phone, password and joining date are required.'
    });
  }

  if (password.length < 10) {
    return res.status(400).json({
      message: 'Temporary password must be at least 10 characters.'
    });
  }

  try {
    const hash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (
          name,
          email,
          phone,
          password_hash,
          role,
          job_title,
          date_of_joining,
          date_of_expiry
       )
       VALUES ($1, $2, $3, $4, 'employee', $5, $6, $7)
       RETURNING
          id,
          employee_code,
          name,
          email,
          phone,
          job_title,
          date_of_joining,
          date_of_expiry,
          is_active,
          must_change_password`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        phone.trim(),
        hash,
        jobTitle || 'Employee',
        dateOfJoining,
        dateOfExpiry || null
      ]
    );

    return res.status(201).json({
      success: true,
      employee: result.rows[0]
    });
  } catch (error) {
    console.error('Create employee error:', error);

    return res.status(error.code === '23505' ? 409 : 500).json({
      message: error.code === '23505'
        ? 'Email already exists.'
        : 'Could not create employee.'
    });
  }
});

// UPDATE EMPLOYEE
router.patch('/employees/:id', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      jobTitle,
      dateOfJoining,
      dateOfExpiry
    } = req.body;

    const result = await query(
      `UPDATE users
       SET
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          job_title = COALESCE($4, job_title),
          date_of_joining = COALESCE($5, date_of_joining),
          date_of_expiry = $6,
          updated_at = NOW()
       WHERE id = $7
         AND role = 'employee'
         AND deleted_at IS NULL
       RETURNING
          id,
          employee_code,
          name,
          email,
          phone,
          job_title,
          date_of_joining,
          date_of_expiry,
          is_active`,
      [
        name?.trim() || null,
        email?.trim().toLowerCase() || null,
        phone?.trim() || null,
        jobTitle || null,
        dateOfJoining || null,
        dateOfExpiry || null,
        req.params.id
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        message: 'Employee not found.'
      });
    }

    return res.json({
      success: true,
      employee: result.rows[0]
    });
  } catch (error) {
    console.error('Update employee error:', error);

    return res.status(error.code === '23505' ? 409 : 500).json({
      message: error.code === '23505'
        ? 'Email already exists.'
        : 'Could not update employee.'
    });
  }
});

// ACTIVATE / DEACTIVATE EMPLOYEE
router.patch('/employees/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        message: 'isActive must be true or false.'
      });
    }

    const result = await query(
      `UPDATE users
       SET is_active = $1,
           updated_at = NOW()
       WHERE id = $2
         AND role = 'employee'
         AND deleted_at IS NULL
       RETURNING id, is_active`,
      [isActive, req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        message: 'Employee not found.'
      });
    }

    return res.json({
      success: true,
      employee: result.rows[0]
    });
  } catch (error) {
    console.error('Employee status update error:', error);

    return res.status(500).json({
      message: 'Could not update employee status.'
    });
  }
});

// SOFT DELETE EMPLOYEE
router.delete('/employees/:id', async (req, res) => {
  try {
    const result = await query(
      `UPDATE users
       SET deleted_at = NOW(),
           is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
         AND role = 'employee'
         AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        message: 'Employee not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Employee removed successfully.'
    });
  } catch (error) {
    console.error('Delete employee error:', error);

    return res.status(500).json({
      message: 'Could not remove employee.'
    });
  }
});

/* =========================================
   MANAGER MANAGEMENT
========================================= */

// GET MANAGERS
router.get('/managers', async (_req, res) => {
  try {
    const result = await query(
      'SELECT * FROM managers ORDER BY name'
    );

    return res.json({
      success: true,
      managers: result.rows
    });
  } catch (error) {
    console.error('Get managers error:', error);

    return res.status(500).json({
      message: 'Unable to load managers.'
    });
  }
});

// CREATE MANAGER
router.post('/managers', async (req, res) => {
  try {
    const {
      name,
      roleTitle,
      email,
      phone
    } = req.body;

    if (!name || !roleTitle || !email || !phone) {
      return res.status(400).json({
        message: 'All manager fields are required.'
      });
    }

    const result = await query(
      `INSERT INTO managers (
          name,
          role_title,
          email,
          phone
       )
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        name.trim(),
        roleTitle.trim(),
        email.trim().toLowerCase(),
        phone.trim()
      ]
    );

    return res.status(201).json({
      success: true,
      manager: result.rows[0]
    });
  } catch (error) {
    console.error('Create manager error:', error);

    return res.status(500).json({
      message: 'Could not create manager.'
    });
  }
});

/* =========================================
   PROJECT MANAGEMENT
========================================= */

// CREATE PROJECT
router.post('/projects', async (req, res) => {
  const {
    projectName,
    description,
    status,
    startDate,
    deadline,
    managerId,
    employeeIds = []
  } = req.body;

  if (!projectName || !startDate || !deadline) {
    return res.status(400).json({
      message: 'Project name, start date and deadline are required.'
    });
  }

  if (!Array.isArray(employeeIds)) {
    return res.status(400).json({
      message: 'employeeIds must be an array.'
    });
  }

  try {
    const result = await query(
      `INSERT INTO projects (
          project_name,
          description,
          status,
          start_date,
          deadline,
          manager_id
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        projectName,
        description || '',
        status || 'Not Started',
        startDate,
        deadline,
        managerId || null
      ]
    );

    for (const employeeId of employeeIds) {
      await query(
        `INSERT INTO project_members (
            project_id,
            employee_id
         )
         SELECT $1, id
         FROM users
         WHERE id = $2
           AND role = 'employee'
           AND deleted_at IS NULL
         ON CONFLICT DO NOTHING`,
        [result.rows[0].id, employeeId]
      );
    }

    return res.status(201).json({
      success: true,
      project: result.rows[0]
    });
  } catch (error) {
    console.error('Create project error:', error);

    return res.status(500).json({
      message: 'Could not create project.'
    });
  }
});

// UPDATE PROJECT
router.patch('/projects/:id', async (req, res) => {
  try {
    const {
      projectName,
      description,
      status,
      startDate,
      deadline,
      managerId,
      employeeIds = []
    } = req.body;

    if (!Array.isArray(employeeIds)) {
      return res.status(400).json({
        message: 'employeeIds must be an array.'
      });
    }

    const result = await query(
      `UPDATE projects
       SET
          project_name = COALESCE($1, project_name),
          description = COALESCE($2, description),
          status = COALESCE($3, status),
          start_date = COALESCE($4, start_date),
          deadline = COALESCE($5, deadline),
          manager_id = $6,
          updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        projectName || null,
        description ?? null,
        status || null,
        startDate || null,
        deadline || null,
        managerId || null,
        req.params.id
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        message: 'Project not found.'
      });
    }

    await query(
      'DELETE FROM project_members WHERE project_id = $1',
      [req.params.id]
    );

    for (const employeeId of employeeIds) {
      await query(
        `INSERT INTO project_members (project_id, employee_id)
         SELECT $1, id
         FROM users
         WHERE id = $2
           AND role = 'employee'
           AND deleted_at IS NULL
         ON CONFLICT DO NOTHING`,
        [req.params.id, employeeId]
      );
    }

    return res.json({
      success: true,
      project: result.rows[0]
    });
  } catch (error) {
    console.error('Update project error:', error);

    return res.status(500).json({
      message: 'Could not update project.'
    });
  }
});

// DELETE PROJECT
router.delete('/projects/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM projects WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: 'Project not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Project deleted successfully.'
    });
  } catch (error) {
    console.error('Delete project error:', error);

    return res.status(500).json({
      message: 'Could not delete project.'
    });
  }
});

/* =========================================
   EMPLOYEE DOCUMENT MANAGEMENT
========================================= */

// UPLOAD DOCUMENT FOR EMPLOYEE — Cloudinary authenticated RAW asset
router.post(
  '/employees/:id/documents',
  pdfUpload.single('document'),
  async (req, res) => {
    let uploadedPublicId = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload a PDF up to 10 MB.'
        });
      }

      // Validate actual PDF signature.
      if (
        req.file.mimetype !== 'application/pdf' ||
        !req.file.buffer ||
        req.file.buffer.subarray(0, 5).toString() !== '%PDF-'
      ) {
        return res.status(400).json({
          success: false,
          message: 'The uploaded file is not a valid PDF.'
        });
      }

      const {
        documentType = 'certificate',
        title
      } = req.body;

      const allowed = [
        'offer_letter',
        'completion_certificate',
        'recommendation_letter',
        'certificate',
        'other'
      ];

      if (!allowed.includes(documentType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid document type.'
        });
      }

      // Check employee exists.
      const employeeResult = await query(
        `SELECT id
         FROM users
         WHERE id = $1
           AND role = 'employee'
           AND deleted_at IS NULL`,
        [req.params.id]
      );

      if (!employeeResult.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found.'
        });
      }

      // Upload PDF to Cloudinary.
      const cloudinaryResult = await uploadPdf(req.file);
      uploadedPublicId = cloudinaryResult.public_id;

      // Save Cloudinary public ID in PostgreSQL.
      const result = await query(
        `INSERT INTO employee_documents (
            employee_id,
            document_type,
            title,
            file_name,
            storage_path
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          req.params.id,
          documentType,
          String(title || req.file.originalname).trim(),
          req.file.originalname,
          cloudinaryResult.public_id
        ]
      );

      return res.status(201).json({
        success: true,
        message: 'Document uploaded successfully.',
        document: {
          ...result.rows[0],
          document_url: `/api/files/document/${result.rows[0].id}`
        }
      });
    } catch (error) {
      // Clean up uploaded Cloudinary file if DB insertion fails.
      if (uploadedPublicId) {
        try {
          await deleteCloudinaryFile(uploadedPublicId, 'raw');
        } catch (cleanupError) {
          console.error(
            'Cloudinary upload cleanup error:',
            cleanupError.message
          );
        }
      }

      console.error('Admin document upload error:', error);

      return res.status(500).json({
        success: false,
        message: 'Could not upload employee document.'
      });
    }
  }
);

/* =========================================
   DELETE EMPLOYEE DOCUMENT — ADMIN ONLY
========================================= */

router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query(
      `SELECT id, storage_path
       FROM employee_documents
       WHERE id = $1`,
      [id]
    );

    const document = existing.rows[0];

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.'
      });
    }

    const storagePath = String(document.storage_path || '').trim();

    const isLegacyLocalPath =
      !storagePath ||
      storagePath.startsWith('/api/') ||
      storagePath.startsWith('uploads/') ||
      storagePath.startsWith('http://') ||
      storagePath.startsWith('https://');

    // Delete Cloudinary asset first.
    if (!isLegacyLocalPath) {
      const cloudinaryResult = await deleteCloudinaryFile(
        storagePath,
        'raw'
      );

      if (
        cloudinaryResult?.result &&
        !['ok', 'not found'].includes(cloudinaryResult.result)
      ) {
        throw new Error(
          `Cloudinary delete failed: ${cloudinaryResult.result}`
        );
      }
    }

    // Delete database record.
    await query(
      `DELETE FROM employee_documents
       WHERE id = $1`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Employee document deleted successfully.'
    });
  } catch (error) {
    console.error('Admin document delete error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to delete employee document.'
    });
  }
});

/* =========================================
   EMPLOYEE LOGIN ACTIVITY
========================================= */

// Latest five login records for each active employee.
router.get('/login-activity', async (_req, res) => {
  try {
    const result = await query(
      `SELECT *
       FROM (
         SELECT
            a.id AS activity_id,
            a.employee_id,
            u.employee_code,
            u.name AS employee_name,
            u.email,
            u.job_title,
            a.logged_in_at,
            a.ended_at,
            a.location_status,
            a.latitude,
            a.longitude,
            a.accuracy,
            a.location_updated_at,
            ROW_NUMBER() OVER (
              PARTITION BY a.employee_id
              ORDER BY a.logged_in_at DESC
            ) AS login_number
         FROM employee_login_activity a
         INNER JOIN users u ON u.id = a.employee_id
         WHERE u.role = 'employee'
           AND u.deleted_at IS NULL
       ) activity
       WHERE login_number <= 5
       ORDER BY employee_name ASC, logged_in_at DESC`
    );

    return res.json({
      success: true,
      activities: result.rows
    });
  } catch (error) {
    console.error('Admin login activity error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load employee login activity.'
    });
  }
});

export default router;