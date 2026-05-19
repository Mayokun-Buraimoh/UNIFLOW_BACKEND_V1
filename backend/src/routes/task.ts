import express from 'express';
import {
  getUserTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskStatus,
  getTaskStats,
} from '../controllers/task';
import { authenticateToken } from '../middleware/auth';
import { requireUuidParams } from '../utils/uuid';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getUserTasks);
router.get('/stats', getTaskStats);
router.post('/', createTask);

router.get('/:id', requireUuidParams('id'), getTask);
router.put('/:id', requireUuidParams('id'), updateTask);
router.patch('/:id/toggle', requireUuidParams('id'), toggleTaskStatus);
router.delete('/:id', requireUuidParams('id'), deleteTask);

export default router;