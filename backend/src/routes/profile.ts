import express from 'express';
import { 
  getProfile, 
  updateProfile, 
  updateNotificationSettings, 
  updateStudyGoals, 
  updatePreferences 
} from '../controllers/profile';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Profile routes
router.get('/', getProfile);
router.patch('/', updateProfile);

// Specific profile settings routes
router.patch('/notifications', updateNotificationSettings);
router.patch('/study-goals', updateStudyGoals);
router.patch('/preferences', updatePreferences);

export default router;
