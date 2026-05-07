import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as eventController from '../controllers/event';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get all events for the authenticated user
router.get('/', eventController.getUserEvents);

// Create event
router.post('/', eventController.createEvent);

// Get single event
router.get('/:id', eventController.getEvent);

// Update event
router.put('/:id', eventController.updateEvent);

// Delete event
router.delete('/:id', eventController.deleteEvent);

export default router;
