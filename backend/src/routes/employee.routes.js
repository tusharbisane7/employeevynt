
import { Router } from 'express';
import path from 'path';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';

const router = Router();

// All employee routes require authentication
router.use(authenticate);

/* =========================================
   EMPLOYEE DASHBOARD
========================================= */

router.get('/dashboard', async (req, res) => {
  try {
    const employeeId = req.user.id;

    const [projects, documents] = await Promise.all([

      // Employee assigned projects and manager details
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

      // Employee documents
      // storage_path is included to fix DocumentRow error
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
         ORDER BY uploaded_at DESC`,
        [employeeId]
      )

    ]);

    return res.status(200).json({
      success: true,
      projects: projects.rows,
      documents: documents.rows
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


export default router;
