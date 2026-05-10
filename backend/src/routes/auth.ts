import express from 'express';
import {
  register,
  login,
  getMe,
  changePassword,
  googleCallback,
  googleStart,
  appleSignIn,
  appleRedirectPlaceholder,
} from '../controllers/auth';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/apple', appleSignIn);
router.get('/apple/redirect', appleRedirectPlaceholder);
router.get('/google', googleStart);
router.get('/google/callback', googleCallback);

// Protected routes
router.get('/me', authenticateToken, getMe);
router.post('/change-password', authenticateToken, changePassword);

export default router;
