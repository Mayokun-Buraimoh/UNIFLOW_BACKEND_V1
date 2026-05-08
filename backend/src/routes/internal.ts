import { Router } from 'express';
import * as courseFilesController from '../controllers/courseFiles';

const router = Router();

// Internal backend-to-backend file access for AI ingestion.
router.get('/files/:fileId/pdf', courseFilesController.downloadFileInternal);

export default router;

