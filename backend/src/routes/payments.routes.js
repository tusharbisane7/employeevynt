
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

import { query } from '../config/db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

const SCREENSHOT_MAX_SIZE = 200 * 1024;

const allowedScreenshotTypes = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

/*
|--------------------------------------------------------------------------
| MULTER CONFIGURATION
|--------------------------------------------------------------------------
*/

const screenshotUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: SCREENSHOT_MAX_SIZE,
    files: 1
  },

  fileFilter: (_req, file, callback) => {
    if (!allowedScreenshotTypes.includes(file.mimetype)) {
      return callback(
        new Error('Screenshot must be JPG, PNG or WEBP.')
      );
    }

    callback(null, true);
  }
});

const qrUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },

  fileFilter: (_req, file, callback) => {
    if (!allowedScreenshotTypes.includes(file.mimetype)) {
      return callback(
        new Error('QR code must be JPG, PNG or WEBP.')
      );
    }

    callback(null, true);
  }
});

/*
|--------------------------------------------------------------------------
| CLOUDINARY HELPERS
|--------------------------------------------------------------------------
*/

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

async function deleteCloudinary(
  publicId,
  resourceType = 'image',
  type = 'authenticated'
) {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type,
      invalidate: true
    });
  } catch (error) {
    console.error(
      'Payment Cloudinary cleanup error:',
      error.message
    );
  }
}

/*
|--------------------------------------------------------------------------
| IMAGE SIGNATURE VALIDATION
|--------------------------------------------------------------------------
*/

function validImageSignature(buffer, mimetype) {
  if (!buffer || buffer.length < 12) {
    return false;
  }

  if (mimetype === 'image/png') {
    return buffer
      .subarray(0, 8)
      .equals(
        Buffer.from([
          137, 80, 78, 71, 13, 10, 26, 10
        ])
      );
  }

  if (mimetype === 'image/jpeg') {
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimetype === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP'
    );
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| FEE VALIDATION
|--------------------------------------------------------------------------
*/

function parseFeeItems(items) {
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 20
  ) {
    throw new Error(
      'Add between 1 and 20 fee breakdown items.'
    );
  }

  return items.map(item => {
    const label = String(item.label || '').trim();
    const amount = Number(item.amount);

    if (
      !label ||
      label.length > 100 ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > 1000000
    ) {
      throw new Error(
        'Each fee item needs a valid name and non-negative amount.'
      );
    }

    return {
      label,
      amount: Number(amount.toFixed(2))
    };
  });
}

/*
|--------------------------------------------------------------------------
| GET PAYMENT SETTINGS
|--------------------------------------------------------------------------
*/

async function getSettings() {
  const result = await query(
    `SELECT
        fee_items,
        total_amount,
        upi_id,
        qr_url,
        updated_at
     FROM payment_settings
     WHERE id = 1`
  );

  return result.rows[0] || {
    fee_items: [
      {
        label: 'Employee Portal Fee',
        amount: 149
      }
    ],
    total_amount: 149,
    upi_id: null,
    qr_url: null
  };
}

/*
|--------------------------------------------------------------------------
| GET SETTINGS
|--------------------------------------------------------------------------
| GET /api/payments/settings
|--------------------------------------------------------------------------
*/

router.get('/settings', async (_req, res) => {
  try {
    const settings = await getSettings();

    return res.json({
      success: true,
      settings
    });

  } catch (error) {
    console.error(
      'Payment settings fetch error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load payment settings.'
    });
  }
});

/*
|--------------------------------------------------------------------------
| EMPLOYEE PAYMENT STATUS
|--------------------------------------------------------------------------
| GET /api/payments/me
|--------------------------------------------------------------------------
*/

router.get('/me', async (req, res) => {
  try {
    const result = await query(
      `SELECT
          id,
          amount,
          fee_items_snapshot,
          transaction_reference,
          screenshot_file_name,
          status,
          admin_note,
          submitted_at,
          reviewed_at
       FROM employee_payments
       WHERE employee_id = $1
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    return res.json({
      success: true,
      payment: result.rows[0] || null
    });

  } catch (error) {
    console.error(
      'Employee payment status error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load payment status.'
    });
  }
});

/*
|--------------------------------------------------------------------------
| EMPLOYEE PAYMENT SUBMISSION
|--------------------------------------------------------------------------
| POST /api/payments/submit
|--------------------------------------------------------------------------
*/

router.post(
  '/submit',

  (req, res, next) => {
    screenshotUpload.single('screenshot')(
      req,
      res,
      error => {
        if (!error) return next();

        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Payment screenshot must not exceed 200 KB.'
            : error.message || 'Invalid payment screenshot.';

        return res.status(400).json({
          success: false,
          message
        });
      }
    );
  },

  async (req, res) => {
    let uploadedPublicId = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload your payment screenshot.'
        });
      }

      if (req.file.size > SCREENSHOT_MAX_SIZE) {
        return res.status(400).json({
          success: false,
          message: 'Payment screenshot must not exceed 200 KB.'
        });
      }

      if (
        !validImageSignature(
          req.file.buffer,
          req.file.mimetype
        )
      ) {
        return res.status(400).json({
          success: false,
          message: 'The uploaded file is not a valid supported image.'
        });
      }

      const settings = await getSettings();

      const amount = Number(settings.total_amount);

      if (!settings.upi_id || !settings.qr_url) {
        return res.status(400).json({
          success: false,
          message: 'Payment details are not configured yet. Please contact the administrator.'
        });
      }

      /*
      | Prevent duplicate pending or approved submissions.
      */

      const existing = await query(
        `SELECT id, status
         FROM employee_payments
         WHERE employee_id = $1
           AND status IN ('pending', 'approved')
         ORDER BY submitted_at DESC
         LIMIT 1`,
        [req.user.id]
      );

      if (existing.rows[0]) {
        return res.status(409).json({
          success: false,
          message:
            existing.rows[0].status === 'pending'
              ? 'Your payment is already submitted and awaiting verification.'
              : 'Your payment has already been approved.'
        });
      }

      /*
      | Upload authenticated screenshot to Cloudinary.
      */

      const uploaded = await uploadBuffer(
        req.file.buffer,
        {
          folder: 'vyntara-employee-payments',
          public_id: `payment-${req.user.id}-${Date.now()}`,
          resource_type: 'image',
          type: 'authenticated',
          overwrite: false
        }
      );

      uploadedPublicId = uploaded.public_id;

      const transactionReference = String(
        req.body.transactionReference || ''
      ).trim().slice(0, 120) || null;

      /*
      | Save payment and fee snapshot.
      */

      const result = await query(
        `INSERT INTO employee_payments (
            employee_id,
            amount,
            fee_items_snapshot,
            transaction_reference,
            screenshot_public_id,
            screenshot_file_name,
            status
         )
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, 'pending')
         RETURNING
            id,
            amount,
            status,
            submitted_at`,
        [
          req.user.id,
          amount,
          JSON.stringify(settings.fee_items),
          transactionReference,
          uploadedPublicId,
          path.basename(req.file.originalname)
        ]
      );

      return res.status(201).json({
        success: true,
        message: 'Payment proof submitted. Your payment is pending admin verification.',
        payment: result.rows[0]
      });

    } catch (error) {
      if (uploadedPublicId) {
        await deleteCloudinary(uploadedPublicId);
      }

      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'A pending payment already exists for your account.'
        });
      }

      console.error(
        'Payment submission error:',
        error
      );

      return res.status(500).json({
        success: false,
        message: 'Unable to submit payment proof.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN: PAYMENT SUBMISSIONS
|--------------------------------------------------------------------------
| GET /api/payments/admin/submissions
|--------------------------------------------------------------------------
*/

router.get(
  '/admin/submissions',
  requireAdmin,
  async (req, res) => {
    try {
      const status = [
        'pending',
        'approved',
        'rejected'
      ].includes(req.query.status)
        ? req.query.status
        : null;

      const result = await query(
        `SELECT
            p.id,
            p.employee_id,
            p.amount,
            p.fee_items_snapshot,
            p.transaction_reference,
            p.screenshot_file_name,
            p.status,
            p.admin_note,
            p.submitted_at,
            p.reviewed_at,
            u.employee_code,
            u.name AS employee_name,
            u.email,
            reviewer.name AS reviewed_by_name
         FROM employee_payments p
         INNER JOIN users u
           ON u.id = p.employee_id
         LEFT JOIN users reviewer
           ON reviewer.id = p.reviewed_by
         WHERE ($1::text IS NULL OR p.status = $1)
         ORDER BY
           CASE WHEN p.status = 'pending' THEN 0 ELSE 1 END,
           p.submitted_at DESC
         LIMIT 500`,
        [status]
      );

      return res.json({
        success: true,
        payments: result.rows
      });

    } catch (error) {
      console.error(
        'Admin payment list error:',
        error
      );

      return res.status(500).json({
        success: false,
        message: 'Unable to load payment submissions.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN: VIEW PAYMENT SCREENSHOT
|--------------------------------------------------------------------------
| GET /api/payments/admin/submissions/:id/screenshot
|--------------------------------------------------------------------------
*/

router.get(
  '/admin/submissions/:id/screenshot',
  requireAdmin,
  async (req, res) => {
    try {
      const result = await query(
        `SELECT
            screenshot_public_id,
            screenshot_file_name
         FROM employee_payments
         WHERE id = $1`,
        [req.params.id]
      );

      const payment = result.rows[0];

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found.'
        });
      }

      const url = cloudinary.url(
        payment.screenshot_public_id,
        {
          resource_type: 'image',
          type: 'authenticated',
          sign_url: true,
          secure: true
        }
      );

      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 30000,
        validateStatus: status => status === 200
      });

      const ext = path
        .extname(payment.screenshot_file_name || '')
        .toLowerCase();

      const contentType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';

      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        'inline; filename="payment-proof"'
      );
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      response.data.on('error', error => {
        console.error(
          'Payment screenshot stream error:',
          error
        );

        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.destroy(error);
        }
      });

      return response.data.pipe(res);

    } catch (error) {
      console.error(
        'Payment screenshot retrieval error:',
        error.message
      );

      if (res.headersSent) {
        return res.destroy();
      }

      return res.status(502).json({
        success: false,
        message: 'Unable to retrieve payment screenshot.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN: APPROVE OR REJECT PAYMENT
|--------------------------------------------------------------------------
| PATCH /api/payments/admin/submissions/:id/review
|--------------------------------------------------------------------------
*/

router.patch(
  '/admin/submissions/:id/review',
  requireAdmin,
  async (req, res) => {
    try {
      const status = req.body?.status;

      const adminNote = String(
        req.body?.adminNote || ''
      ).trim().slice(0, 1000) || null;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Choose approved or rejected.'
        });
      }

      if (status === 'rejected' && !adminNote) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a reason for rejection.'
        });
      }

      const result = await query(
        `UPDATE employee_payments
         SET
            status = $1,
            admin_note = $2,
            reviewed_by = $3,
            reviewed_at = NOW(),
            updated_at = NOW()
         WHERE id = $4
           AND status = 'pending'
         RETURNING
            id,
            status,
            admin_note,
            reviewed_at`,
        [
          status,
          adminNote,
          req.user.id,
          req.params.id
        ]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Pending payment not found. It may already have been reviewed.'
        });
      }

      return res.json({
        success: true,
        payment: result.rows[0]
      });

    } catch (error) {
      console.error(
        'Payment review error:',
        error
      );

      return res.status(500).json({
        success: false,
        message: 'Unable to update payment status.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN: UPDATE PAYMENT SETTINGS
|--------------------------------------------------------------------------
| PUT /api/payments/admin/settings
|--------------------------------------------------------------------------
*/

router.put(
  '/admin/settings',
  requireAdmin,
  async (req, res) => {
    try {
      const feeItems = parseFeeItems(
        req.body?.feeItems
      );

      const totalAmount = Number(
        feeItems.reduce(
          (sum, item) => sum + item.amount,
          0
        ).toFixed(2)
      );

      const upiId = String(
        req.body?.upiId || ''
      ).trim().slice(0, 255) || null;

      const result = await query(
        `INSERT INTO payment_settings (
            id,
            fee_items,
            total_amount,
            upi_id,
            updated_by,
            updated_at
         )
         VALUES (1, $1::jsonb, $2, $3, $4, NOW())
         ON CONFLICT (id)
         DO UPDATE SET
            fee_items = EXCLUDED.fee_items,
            total_amount = EXCLUDED.total_amount,
            upi_id = EXCLUDED.upi_id,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
         RETURNING
            fee_items,
            total_amount,
            upi_id,
            qr_url,
            updated_at`,
        [
          JSON.stringify(feeItems),
          totalAmount,
          upiId,
          req.user.id
        ]
      );

      return res.json({
        success: true,
        settings: result.rows[0]
      });

    } catch (error) {
      console.error(
        'Payment settings update error:',
        error
      );

      return res.status(400).json({
        success: false,
        message: error.message ||
          'Unable to update payment settings.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN: UPLOAD / REPLACE QR CODE
|--------------------------------------------------------------------------
| POST /api/payments/admin/settings/qr
|--------------------------------------------------------------------------
*/

router.post(
  '/admin/settings/qr',

  requireAdmin,

  (req, res, next) => {
    qrUpload.single('qr')(
      req,
      res,
      error => {
        if (!error) return next();

        return res.status(400).json({
          success: false,
          message:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'QR image must be 5 MB or smaller.'
              : error.message
        });
      }
    );
  },

  async (req, res) => {
    let newPublicId = null;

    try {
      if (
        !req.file ||
        !validImageSignature(
          req.file.buffer,
          req.file.mimetype
        )
      ) {
        return res.status(400).json({
          success: false,
          message: 'Upload a valid JPG, PNG or WEBP QR image.'
        });
      }

      const uploaded = await uploadBuffer(
        req.file.buffer,
        {
          folder: 'vyntara-payment-qr',
          public_id: `payment-qr-${Date.now()}`,
          resource_type: 'image',
          type: 'upload',
          overwrite: false
        }
      );

      newPublicId = uploaded.public_id;

      const previous = await query(
        `SELECT qr_public_id
         FROM payment_settings
         WHERE id = 1`
      );

      const oldPublicId =
        previous.rows[0]?.qr_public_id;

      const saved = await query(
        `INSERT INTO payment_settings (
            id,
            qr_public_id,
            qr_url,
            updated_by,
            updated_at
         )
         VALUES (1, $1, $2, $3, NOW())
         ON CONFLICT (id)
         DO UPDATE SET
            qr_public_id = EXCLUDED.qr_public_id,
            qr_url = EXCLUDED.qr_url,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
         RETURNING qr_url`,
        [
          newPublicId,
          uploaded.secure_url,
          req.user.id
        ]
      );

      if (
        oldPublicId &&
        oldPublicId !== newPublicId
      ) {
        await deleteCloudinary(
          oldPublicId,
          'image',
          'upload'
        );
      }

      return res.status(200).json({
        success: true,
        qrUrl: saved.rows[0].qr_url,
        message: 'Payment QR updated.'
      });

    } catch (error) {
      if (newPublicId) {
        await deleteCloudinary(
          newPublicId,
          'image',
          'upload'
        );
      }

      console.error(
        'Payment QR upload error:',
        error
      );

      return res.status(500).json({
        success: false,
        message: 'Unable to upload payment QR.'
      });
    }
  }
);

export default router;
