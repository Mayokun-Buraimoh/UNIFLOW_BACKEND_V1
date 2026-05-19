import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as eventController from '../controllers/event';
import { requireUuidParams } from '../utils/uuid';

const router = Router();

router.use(authenticateToken);

router.get('/', eventController.getUserEvents);
router.post('/', eventController.createEvent);

router.get('/:id', requireUuidParams('id'), eventController.getEvent);
router.put('/:id', requireUuidParams('id'), eventController.updateEvent);
router.delete('/:id', requireUuidParams('id'), eventController.deleteEvent);

export default router;
