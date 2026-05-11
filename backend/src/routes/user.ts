import express from 'express';
import { getUserProfile, updateUserProfile, deleteUser, getAllUsers } from '../controllers/user';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// User profile routes
router.get('/me', getUserProfile);
router.patch('/me', updateUserProfile);
router.delete('/me', deleteUser);

// Admin routes (placeholder - would need admin middleware)
router.get('/', getAllUsers);

export default router;
