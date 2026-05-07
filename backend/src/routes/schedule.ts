import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { getMySchedule, upsertMySchedule } from '../controllers/schedule';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getMySchedule);
router.put('/', upsertMySchedule);

export default router;


