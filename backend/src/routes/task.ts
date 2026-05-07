import express from 'express';
import { 
  getUserTasks, 
  getTask, 
  createTask, 
  updateTask, 
  deleteTask, 
  toggleTaskStatus, 
  getTaskStats 
} from '../controllers/task';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Task routes
router.get('/', getUserTasks);
router.get('/stats', getTaskStats);
router.get('/:id', getTask);
router.post('/', createTask);
router.put('/:id', updateTask);
router.patch('/:id/toggle', toggleTaskStatus);
router.delete('/:id', deleteTask);

export default router;