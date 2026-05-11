import { Request, Response } from 'express';
import { Profile } from '../models/profile';
import {
  createRubySession,
  deleteRubySession,
  getRubySession,
} from '../services/rubySessionStore';
import { buildRubySystemPrompt, runRubyGreeting, runRubyVoiceTurn } from '../services/rubyVoiceOrchestrator';

async function resolveFirstName(userId: string): Promise<string> {
  const profile = await Profile.findOne({ where: { userId } });
  const raw = profile?.name?.trim() || '';
  return raw ? raw.split(/\s+/)[0]! : 'there';
}

export async function postVoiceSession(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { action, timezone, session_id } = req.body || {};

    if (action === 'end') {
      if (session_id && typeof session_id === 'string') {
        const s = getRubySession(session_id);
        if (s && s.userId === userId) {
          deleteRubySession(session_id);
        }
      }
      res.json({ ok: true });
      return;
    }

    if (action !== 'start') {
      res.status(400).json({ error: 'action must be "start" or "end"' });
      return;
    }

    const firstName = await resolveFirstName(userId);
    const tz = typeof timezone === 'string' && timezone.length > 0 ? timezone : 'UTC';
    const systemPrompt = buildRubySystemPrompt(firstName, tz);
    const session = createRubySession(userId, tz, firstName, { role: 'system', content: systemPrompt });
    res.json({ session_id: session.id });
  } catch (e) {
    console.error('[voice/session]', e);
    res.status(500).json({ error: 'Failed to manage voice session' });
  }
}

export async function postVoiceGreeting(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: 'AI service not configured' });
      return;
    }
    const firstName = await resolveFirstName(userId);
    const payload = await runRubyGreeting(firstName);
    res.json(payload);
  } catch (e) {
    console.error('[voice/greeting]', e);
    const msg = e instanceof Error ? e.message : 'Greeting failed';
    if (msg.includes('OPENAI_API_KEY')) {
      res.status(503).json({ error: 'AI service not configured' });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

export async function postVoiceTurnText(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: 'AI service not configured' });
      return;
    }

    const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id : '';
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim() : '';
    if (!sessionId || !transcript) {
      res.status(400).json({ error: 'session_id and transcript are required' });
      return;
    }

    const session = getRubySession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(404).json({ error: 'Invalid or expired session' });
      return;
    }

    const includeDebug = process.env.NODE_ENV === 'development';
    const result = await runRubyVoiceTurn({
      session,
      forcedTranscript: transcript,
      includeDebug,
    });

    res.json({
      transcript: result.transcript,
      message: result.message,
      audioBase64: result.audioBase64,
      audioMimeType: result.audioMimeType,
      sessionId: result.sessionId,
      mutations: result.mutations,
      ...(includeDebug && result.debug ? { debug: result.debug } : {}),
    });
  } catch (e) {
    console.error('[voice/turn-text]', e);
    const msg = e instanceof Error ? e.message : 'Voice turn failed';
    if (msg.includes('OPENAI_API_KEY')) {
      res.status(503).json({ error: 'AI service not configured' });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

export async function postVoiceTurn(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: 'AI service not configured' });
      return;
    }

    const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id : '';
    if (!sessionId) {
      res.status(400).json({ error: 'session_id is required' });
      return;
    }

    const session = getRubySession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(404).json({ error: 'Invalid or expired session' });
      return;
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    const includeDebug = process.env.NODE_ENV === 'development';

    if (!file || !file.buffer?.length) {
      res.status(400).json({ error: 'audio file (field: audio) is required' });
      return;
    }

    const result = await runRubyVoiceTurn({
      session,
      audioBuffer: file.buffer,
      audioOriginalname: file.originalname,
      audioMimetype: file.mimetype,
      includeDebug,
    });

    res.json({
      transcript: result.transcript,
      message: result.message,
      audioBase64: result.audioBase64,
      audioMimeType: result.audioMimeType,
      sessionId: result.sessionId,
      mutations: result.mutations,
      ...(includeDebug && result.debug ? { debug: result.debug } : {}),
    });
  } catch (e) {
    console.error('[voice/turn]', e);
    const msg = e instanceof Error ? e.message : 'Voice turn failed';
    if (msg.includes('OPENAI_API_KEY')) {
      res.status(503).json({ error: 'AI service not configured' });
      return;
    }
    res.status(500).json({ error: msg });
  }
}
