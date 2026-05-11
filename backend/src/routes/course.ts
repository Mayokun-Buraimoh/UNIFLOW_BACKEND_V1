import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as courseController from '../controllers/course';
import * as courseNotesController from '../controllers/courseNotes';
import * as courseFilesController from '../controllers/courseFiles';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get all courses for the authenticated user
router.get('/', courseController.getUserCourses);

// Create course manually
router.post('/', courseController.createCourse);

// Get single course
router.get('/:id', courseController.getCourse);

// Create or update Moodle connection
router.post('/moodle/connect', courseController.createOrUpdateMoodleConnection);

// Get Moodle connection status
router.get('/moodle/connection', courseController.getMoodleConnection);

// Sync courses from Moodle
router.post('/moodle/sync', courseController.syncCourses);

// Update course
router.patch('/:id', courseController.updateCourse);

// Delete course
router.delete('/:id', courseController.deleteCourse);

// Course notes routes (nested under course)
router.get('/:id/notes', courseNotesController.getCourseNotes);
router.post('/:id/notes', courseNotesController.createCourseNote);
router.patch('/:id/notes/:noteId', courseNotesController.updateCourseNote);
router.delete('/:id/notes/:noteId', courseNotesController.deleteCourseNote);

// Course files routes
router.get('/:id/files', courseFilesController.listFiles);
router.post('/:id/files', courseFilesController.uploadMiddleware, courseFilesController.uploadFile);
router.get('/:id/files/:fileId', courseFilesController.downloadFile);
router.delete('/:id/files/:fileId', courseFilesController.deleteFile);

export default router;
