
import multer from 'multer';

/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const PDF_MAX_SIZE = 10 * 1024 * 1024;   // 10 MB
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;  // 5 MB

/*
|--------------------------------------------------------------------------
| MEMORY STORAGE
|--------------------------------------------------------------------------
|
| Files are temporarily stored in memory.
| They are not saved inside Render's uploads directory.
| The upload controller sends file.buffer to Cloudinary.
|
*/

const storage = multer.memoryStorage();

/*
|--------------------------------------------------------------------------
| PDF UPLOAD
|--------------------------------------------------------------------------
*/

export const pdfUpload = multer({
  storage,

  limits: {
    fileSize: PDF_MAX_SIZE,
    files: 1
  },

  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed.'));
    }

    cb(null, true);
  }
});

/*
|--------------------------------------------------------------------------
| IMAGE UPLOAD
|--------------------------------------------------------------------------
*/

const allowedImageTypes = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

export const imageUpload = multer({
  storage,

  limits: {
    fileSize: IMAGE_MAX_SIZE,
    files: 1
  },

  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return cb(
        new Error('Only JPG, PNG and WEBP images are allowed.')
      );
    }

    cb(null, true);
  }
});
