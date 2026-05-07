import { Request, Response } from 'express';
import { DevicePushToken } from '../models/DevicePushToken';

export const registerDevicePushToken = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { token, platform } = req.body as { token?: string; platform?: string };

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }

    const trimmed = token.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'token is invalid' });
    }

    await DevicePushToken.destroy({ where: { token: trimmed } });

    const row = await DevicePushToken.create({
      userId,
      token: trimmed,
      platform: typeof platform === 'string' ? platform.slice(0, 32) : null,
    });

    res.status(201).json({ id: row.id, token: row.token, platform: row.platform });
  } catch (error: any) {
    console.error('registerDevicePushToken error:', error);
    res.status(500).json({ error: error.message || 'Failed to register push token' });
  }
};

export const removeDevicePushToken = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { token } = req.body as { token?: string };

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }

    const deleted = await DevicePushToken.destroy({
      where: { userId, token: token.trim() },
    });

    res.json({ removed: deleted });
  } catch (error: any) {
    console.error('removeDevicePushToken error:', error);
    res.status(500).json({ error: error.message || 'Failed to remove push token' });
  }
};
