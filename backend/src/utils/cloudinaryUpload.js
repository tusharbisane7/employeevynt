
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

const uploadToCloudinary = (file, folder, resourceType) => {
  return new Promise((resolve, reject) => {
    if (!file?.buffer) {
      return reject(new Error('No file buffer received.'));
    }

    const originalName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    const extension = path.extname(originalName);
    const filename = path.basename(originalName, extension);

    const publicId = `${Date.now()}-${filename}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        type: 'authenticated',
        overwrite: false
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve({
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format,
          original_filename: originalName,
          bytes: result.bytes
        });
      }
    );

    stream.end(file.buffer);
  });
};

export const uploadPdf = (file) =>
  uploadToCloudinary(
    file,
    'employee-documents',
    'raw'
  );

export const uploadImage = (file) =>
  uploadToCloudinary(
    file,
    'employee-profile-photos',
    'image'
  );

export const deleteCloudinaryFile = async (
  publicId,
  resourceType = 'raw'
) => {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    invalidate: true
  });
};

export default uploadToCloudinary;
