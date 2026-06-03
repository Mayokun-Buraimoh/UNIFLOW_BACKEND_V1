import { Request, Response } from 'express';
import {
  createPlanForUser,
  deletePlanForUser,
  getPlanForUser,
  listPlansForUser,
  updatePlanForUser,
} from '../services/planService';

export async function listPlans(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const plans = await listPlansForUser(userId);
    res.json({ plans });
  } catch (error) {
    console.error('List plans error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
}

export async function getPlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    const planId = req.params.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const plan = await getPlanForUser(userId, planId);
    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ plan });
  } catch (error) {
    console.error('Get plan error:', error);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
}

export async function createPlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { title, isCustom, bannerImage } = req.body || {};
    const plan = await createPlanForUser(userId, { title, isCustom, bannerImage });
    res.status(201).json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create plan';
    console.error('Create plan error:', error);
    res.status(400).json({ error: message });
  }
}

export async function updatePlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    const planId = req.params.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { title, bannerImage, targets, tasks } = req.body || {};
    const plan = await updatePlanForUser(userId, planId, { title, bannerImage, targets, tasks });
    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update plan';
    console.error('Update plan error:', error);
    res.status(400).json({ error: message });
  }
}

export async function deletePlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    const planId = req.params.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const ok = await deletePlanForUser(userId, planId);
    if (!ok) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
}
