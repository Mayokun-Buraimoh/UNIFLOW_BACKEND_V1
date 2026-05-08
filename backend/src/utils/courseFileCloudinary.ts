import { v2 as cloudinary } from 'cloudinary';

function isConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_URL?.trim());
}

export type UploadPdfResult = {
  secureUrl: string;
  publicId: string;
};

/**
 * Upload a local PDF to Cloudinary (raw). Requires CLOUDINARY_URL in the environment.
 */
export async function uploadCoursePdfToCloudinary(options: {
  localPath: string;
  courseId: string;
  fileId: string;
}): Promise<UploadPdfResult> {
  if (!isConfigured()) {
    throw new Error('CLOUDINARY_URL is not set');
  }

  const { localPath, courseId, fileId } = options;
  const result = await cloudinary.uploader.upload(localPath, {
    resource_type: 'raw',
    folder: `uniflow/courses/${courseId}`,
    public_id: fileId,
    overwrite: false,
  });

  const secureUrl = result.secure_url as string | undefined;
  const publicId = result.public_id as string | undefined;
  if (!secureUrl || !publicId) {
    throw new Error('Cloudinary upload returned no secure_url/public_id');
  }
  return { secureUrl, publicId };
}

export async function destroyCourseFileOnCloudinary(publicId: string): Promise<void> {
  if (!isConfigured() || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  } catch (e) {
    console.warn('Cloudinary destroy failed:', e);
  }
}

export { isConfigured as isCloudinaryConfigured };
