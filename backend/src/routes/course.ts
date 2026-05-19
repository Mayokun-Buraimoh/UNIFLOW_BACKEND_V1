import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as courseController from '../controllers/course';
import * as courseNotesController from '../controllers/courseNotes';
import * as courseFilesController from '../controllers/courseFiles';
import { requireUuidParams } from '../utils/uuid';

const router = Router();

router.use(authenticateToken);

router.get('/', courseController.getUserCourses);
router.post('/', courseController.createCourse);

// Moodle endpoints (define BEFORE `/:id` so they aren't shadowed)
router.post('/moodle/connect', courseController.createOrUpdateMoodleConnection);
router.get('/moodle/connection', courseController.getMoodleConnection);
router.post('/moodle/sync', courseController.syncCourses);

// Single-course routes — UUID required (client local-first temp ids like
// `lf-temp-…` get a clean 400 instead of crashing the Postgres uuid cast).
router.get('/:id', requireUuidParams('id'), courseController.getCourse);
router.patch('/:id', requireUuidParams('id'), courseController.updateCourse);
router.delete('/:id', requireUuidParams('id'), courseController.deleteCourse);

// Course notes routes (nested under course)
router.get('/:id/notes', requireUuidParams('id'), courseNotesController.getCourseNotes);
router.post('/:id/notes', requireUuidParams('id'), courseNotesController.createCourseNote);
router.patch(
  '/:id/notes/:noteId',
  requireUuidParams('id', 'noteId'),
  courseNotesController.updateCourseNote
);
router.delete(
  '/:id/notes/:noteId',
  requireUuidParams('id', 'noteId'),
  courseNotesController.deleteCourseNote
);

// Course files routes
router.get('/:id/files', requireUuidParams('id'), courseFilesController.listFiles);
router.post(
  '/:id/files',
  courseFilesController.requireUuidCourseForFileUpload,
  courseFilesController.uploadMiddleware,
  courseFilesController.uploadFile
);
router.get(
  '/:id/files/:fileId',
  requireUuidParams('id', 'fileId'),
  courseFilesController.downloadFile
);
router.delete(
  '/:id/files/:fileId',
  requireUuidParams('id', 'fileId'),
  courseFilesController.deleteFile
);

export default router;
