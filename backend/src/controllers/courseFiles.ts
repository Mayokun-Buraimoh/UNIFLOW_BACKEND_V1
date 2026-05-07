import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import CourseFile from '../models/CourseFile';
import { Course } from '../models/Course';

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

    // Verify course belongs to user
    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const file = (req as MulterRequest).file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Convert non-PDF documents to PDF synchronously using LibreOffice
    const convertAsync = promisify(libre.convert);
    const originalPath = file.path;
    const originalExt = path.extname(file.originalname).toLowerCase();
    let finalOriginalName = file.originalname;
    let finalPath = originalPath;
    let finalMime = file.mimetype;
    let finalSize = file.size;

    if (originalExt !== '.pdf') {
      try {
        const input = fs.readFileSync(originalPath);
        // Convert to PDF
        const done = await convertAsync(input, '.pdf', undefined);
        const pdfFilename = `${path.basename(originalPath, path.extname(originalPath))}.pdf`;
        const pdfPath = path.join(path.dirname(originalPath), pdfFilename);
        fs.writeFileSync(pdfPath, done);

        // Remove the original uploaded file (replace with PDF)
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
          error: 'Document conversion failed. Please upload PDF or fix LibreOffice on server.',
        });
      }
    }

    const storagePath = path.relative(process.cwd(), finalPath);

    const record = await CourseFile.create({
      courseId,
      userId,
      originalName: finalOriginalName,
      mimeType: finalMime,
      size: finalSize,
      storagePath,
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

    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const fileRecord = await CourseFile.findOne({ where: { id: fileId, courseId, userId } });
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

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

// DELETE /api/courses/:id/files/:fileId
export const deleteFile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    const fileId = req.params.fileId;

    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const fileRecord = await CourseFile.findOne({ where: { id: fileId, courseId, userId } });
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

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
  uploadFile,
  listFiles,
  downloadFile,
  deleteFile,
};
