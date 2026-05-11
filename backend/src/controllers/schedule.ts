import { Request, Response } from 'express';
import { WeeklySchedule } from '../models/WeeklySchedule';

// Get the authenticated user's weekly schedule
export const getMySchedule = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const schedule = await WeeklySchedule.findOne({ where: { userId } });
    if (!schedule) {
      return res.json({ data: null });
    }
    return res.json({ data: schedule });
  } catch (error) {
    console.error('Get schedule error:', error);
    return res.status(500).json({ error: 'Failed to fetch weekly schedule' });
  }
};

// Create or update the authenticated user's weekly schedule
export const upsertMySchedule = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { data } = req.body as { data: Record<string, string[]> };
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid schedule data' });
    }

    const existing = await WeeklySchedule.findOne({ where: { userId } });
    if (existing) {
      await existing.update({ data });
      return res.json({ data: existing });
    }

    const created = await WeeklySchedule.create({ userId, data });
    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('Upsert schedule error:', error);
    return res.status(500).json({ error: 'Failed to save weekly schedule' });
  }
};


