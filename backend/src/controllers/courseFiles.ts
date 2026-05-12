import { NextFunction, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import CourseFile from '../models/CourseFile';
import { Course } from '../models/Course';
import {
  destroyCourseFileOnCloudinary,
  isCloudinaryConfigured,
  uploadCoursePdfToCloudinary,
} from '../utils/courseFileCloudinary';

/** Any canonical 8-4-4-4-12 UUID string (used where we only need shape checks). */
function isUuidParam(fileId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(fileId || '').trim());
}

/** LibreOffice can turn these into PDF. Everything else (e.g. images) must not hit convert. */
const OFFICE_LIKE_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.dot',
  '.dotx',
  '.ppt',
  '.pptx',
  '.pot',
  '.potx',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
  '.txt',
]);

function shouldConvertOfficeToPdf(ext: string): boolean {
  return OFFICE_LIKE_EXTENSIONS.has(ext);
}

/** PostgreSQL UUID for `courses.id` / `course_files.id` — reject local-first `lf-temp-…` before Sequelize casts (avoids 500). */
const ROW_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRowUuid(s: string | undefined): boolean {
  return Boolean(s && ROW_UUID_RE.test(String(s).trim()));
}

/** Run before multer so invalid temp course ids do not write under `uploads/courses/lf-temp-…`. */
export function requireUuidCourseForFileUpload(req: Request, res: Response, next: NextFunction): void {
  if (!isRowUuid(req.params.id)) {
    res.status(400).json({
      error:
        'Course is still syncing from this device. Open it again from the Courses list, then upload.',
    });
    return;
  }
  next();
}

function rejectUnsupportedUpload(res: Response, originalPath: string): void {
  try {
    if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
  } catch {
    // ignore
  }
  res.status(415).json({
    error:
      'Unsupported file type. Upload a PDF or a supported document (Word, PowerPoint, OpenDocument, RTF, or plain text).',
  });
}

// Storage setup: store files under ./uploads/courses/<courseId>/
const uploadsRoot = path.resolve(process.cwd(), 'uploads', 'courses');

// Type for request that may include multer file
type MulterRequest = Request & { file?: Express.Multer.File };

const storage = multer.diskStorage({
  destination: (req: MulterRequest, file: Express.Multer.File, cb: (err: Error | null, destination: string) => void) => {
    const courseId = req.params.id;
    const dir = path.join(uploadsRoot, courseId);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      // ignore
    }
    cb(null, dir);
  },
  filename: (req: MulterRequest, file: Express.Multer.File, cb: (err: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

export const uploadMiddleware = upload.single('file');

// POST /api/courses/:id/files
export const uploadFile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    if (!isRowUuid(courseId)) {
      return res.status(400).json({
        error:
          'Invalid course id. Open the course from the Courses list after sync finishes, then upload again.',
      });
    }

    // Verify course belongs to user
    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const file = (req as MulterRequest).file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const convertAsync = promisify(libre.convert);
    const originalPath = file.path;
    const originalExt = path.extname(file.originalname).toLowerCase();
    let finalOriginalName = file.originalname;
    let finalPath = originalPath;
    let finalMime = file.mimetype;
    let finalSize = file.size;

    if (originalExt === '.pdf') {
      // keep as-is
    } else if (shouldConvertOfficeToPdf(originalExt)) {
      // Office-class → PDF via LibreOffice (`soffice` must be on PATH — see Dockerfile)
      try {
        const input = fs.readFileSync(originalPath);
        const done = await convertAsync(input, '.pdf', undefined);
        const pdfFilename = `${path.basename(originalPath, path.extname(originalPath))}.pdf`;
        const pdfPath = path.join(path.dirname(originalPath), pdfFilename);
        fs.writeFileSync(pdfPath, done);

        try {
          fs.unlinkSync(originalPath);
        } catch (unlinkErr) {
          console.warn('Failed to remove original file after conversion:', unlinkErr);
        }

        finalPath = pdfPath;
        finalMime = 'application/pdf';
        finalSize = fs.statSync(pdfPath).size;
        finalOriginalName = `${path.basename(file.originalname, path.extname(file.originalname))}.pdf`;
      } catch (convErr) {
        console.error('Conversion to PDF failed:', convErr);
        try {
          if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
        } catch (cleanupErr) {
          console.warn('Failed to cleanup failed upload:', cleanupErr);
        }
        return res.status(422).json({
          error:
            'Document conversion failed. Install LibreOffice on the server (see backend Dockerfile) or upload a PDF.',
        });
      }
    } else {
      return rejectUnsupportedUpload(res, originalPath);
    }

    const storagePath = path.relative(process.cwd(), finalPath);
    const fileId = randomUUID();

    let cloudinaryUrl: string | null = null;
    let cloudinaryPublicId: string | null = null;

    if (isCloudinaryConfigured()) {
      try {
        const up = await uploadCoursePdfToCloudinary({
          localPath: finalPath,
          courseId,
          fileId,
        });
        cloudinaryUrl = up.secureUrl;
        cloudinaryPublicId = up.publicId;
        try {
          fs.unlinkSync(finalPath);
        } catch (unlinkErr) {
          console.warn('Could not remove local file after Cloudinary upload:', unlinkErr);
        }
      } catch (cloudErr) {
        console.error('Cloudinary upload failed; keeping local file:', cloudErr);
      }
    }

    const record = await CourseFile.create({
      id: fileId,
      courseId,
      userId,
      originalName: finalOriginalName,
      mimeType: finalMime,
      size: finalSize,
      storagePath,
      cloudinaryUrl,
      cloudinaryPublicId,
    });

    res.status(201).json(record);
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
};

// GET /api/courses/:id/files
export const listFiles = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    if (!isRowUuid(courseId)) {
      return res.status(400).json({
        error: 'Invalid course id. Open the course from the Courses list after sync finishes.',
      });
    }

    // Verify course
    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const files = await CourseFile.findAll({ where: { courseId, userId }, order: [['createdAt', 'DESC']] });
    res.json({ files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
};

// GET /api/courses/:id/files/:fileId
export const downloadFile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    const fileId = req.params.fileId;
    if (!isRowUuid(courseId) || !isRowUuid(fileId)) {
      return res.status(400).json({
        error:
          'Invalid course or file id. If you just created this folder, go back to Courses and open it again after sync, then re-open the note.',
      });
    }

    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const fileRecord = await CourseFile.findOne({ where: { id: fileId, courseId, userId } });
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

    if (fileRecord.cloudinaryUrl) {
      return res.redirect(302, fileRecord.cloudinaryUrl);
    }

    const absolutePath = path.resolve(process.cwd(), fileRecord.storagePath);
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'File not found on disk' });
    const forceDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(fileRecord.originalName)}"`
    );
    res.sendFile(absolutePath);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
};

// GET /api/internal/files/:fileId/pdf
// API key auth via x-internal-api-key header.
export const downloadFileInternal = async (req: Request, res: Response) => {
  try {
    const expectedKey = (process.env.INTERNAL_API_KEY || '').trim();
    const providedKey = String(req.headers['x-internal-api-key'] || '').trim();
    if (!expectedKey || providedKey !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.fileId;

    if (!isUuidParam(fileId)) {
      return res.status(400).json({ error: 'fileId must be a UUID (course_files.id).' });
    }

    const fileRecord = await CourseFile.findOne({ where: { id: fileId } });
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

    // For AI ingestion, always stream bytes from backend when available on disk.
    // Do not redirect to Cloudinary here; this endpoint is for backend-to-backend access.
    const absolutePath = path.resolve(process.cwd(), fileRecord.storagePath);
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'File not found on disk' });

    res.setHeader('Content-Type', fileRecord.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileRecord.originalName)}"`);
    res.sendFile(absolutePath);
  } catch (error) {
    console.error('Internal download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
};

// DELETE /api/courses/:id/files/:fileId
export const deleteFile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    const fileId = req.params.fileId;
    if (!isRowUuid(courseId) || !isRowUuid(fileId)) {
      return res.status(400).json({ error: 'Invalid course or file id.' });
    }

    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const fileRecord = await CourseFile.findOne({ where: { id: fileId, courseId, userId } });
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

    if (fileRecord.cloudinaryPublicId) {
      await destroyCourseFileOnCloudinary(fileRecord.cloudinaryPublicId);
    }

    const absolutePath = path.resolve(process.cwd(), fileRecord.storagePath);
    try {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch (err) {
      console.warn('Failed to unlink file:', err);
    }

    await fileRecord.destroy();

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};

export default {
  uploadMiddleware,
  requireUuidCourseForFileUpload,
  uploadFile,
  listFiles,
  downloadFile,
  downloadFileInternal,
  deleteFile,
};
