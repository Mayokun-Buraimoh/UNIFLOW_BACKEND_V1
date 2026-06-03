import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireUuidParams } from '../utils/uuid';
import { createPlan, deletePlan, getPlan, listPlans, updatePlan } from '../controllers/plan';

const router = express.Router();

router.use(authenticateToken);

router.get('/', listPlans);
router.post('/', createPlan);
router.get('/:id', requireUuidParams('id'), getPlan);
router.patch('/:id', requireUuidParams('id'), updatePlan);
router.delete('/:id', requireUuidParams('id'), deletePlan);

export default router;
