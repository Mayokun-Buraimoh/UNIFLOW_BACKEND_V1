import { Router } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth';
import { voiceRateLimit } from '../middleware/voiceRateLimit';
import { postVoiceGreeting, postVoiceSession, postVoiceTurn, postVoiceTurnText } from '../controllers/voice';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

router.use(authenticateToken);
router.use(voiceRateLimit);

router.post('/session', postVoiceSession);
router.post('/greeting', postVoiceGreeting);
router.post('/turn-text', postVoiceTurnText);
router.post('/turn', upload.single('audio'), postVoiceTurn);

export default router;
