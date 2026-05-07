import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as pushTokenController from '../controllers/pushToken';

const router = Router();

router.use(authenticateToken);

router.post('/', pushTokenController.registerDevicePushToken);
router.delete('/', pushTokenController.removeDevicePushToken);

export default router;
