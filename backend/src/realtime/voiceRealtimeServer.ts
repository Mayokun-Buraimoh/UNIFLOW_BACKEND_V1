import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import jwt from 'jsonwebtoken';
import type { IncomingMessage } from 'http';

import { getRubySession, touchRubySession } from '../services/rubySessionStore';
import { runRubyVoiceTurn } from '../services/rubyVoiceOrchestrator';
import { User } from '../models/User';

type ClientInbound =
  | {
      type: 'session.start';
      session_id?: string;
      sample_rate_hz?: number;
      encoding?: string;
    }
  | { type: 'session.end'; session_id?: string }
  | { type: 'text.submit'; text?: string; session_id?: string };

type DeepgramResultsEvent = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
    }>;
  };
};

type RealtimeState = 'idle' | 'listening' | 'processing' | 'responding';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function readDeepgramKey(): string {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error('DEEPGRAM_API_KEY is not configured');
  return key;
}

function readWsToken(req: IncomingMessage): string {
  const url = new URL(req.url || '/', 'http://localhost');
  return (url.searchParams.get('token') || '').trim();
}

async function authenticateWsClient(req: IncomingMessage): Promise<string | null> {
  try {
    const token = readWsToken(req);
    if (!token) return null;
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string };
    const userId = (decoded.userId || '').trim();
    if (!userId) return null;
    const user = await User.findByPk(userId);
    return user ? userId : null;
  } catch {
    return null;
  }
}

function deepgramWsUrl(sampleRate: number): string {
  const model = process.env.DEEPGRAM_STT_MODEL || 'nova-3';
  const language = process.env.DEEPGRAM_STT_LANGUAGE || 'en';
  const endpointMs = process.env.DEEPGRAM_ENDPOINTING_MS || '300';
  const params = new URLSearchParams({
    model,
    language,
    encoding: 'linear16',
    sample_rate: String(sampleRate),
    channels: '1',
    punctuate: 'true',
    interim_results: 'true',
    endpointing: endpointMs,
    smart_format: 'true',
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export function setupVoiceRealtimeServer(server: HttpServer): void {
  const wss = new WebSocketServer({
    server,
    path: '/api/voice/realtime',
  });

  wss.on('connection', async (clientWs: WebSocket, req: IncomingMessage) => {
    const authUserId = await authenticateWsClient(req);
    if (!authUserId) {
      sendJson(clientWs, { type: 'error', message: 'Unauthorized websocket connection' });
      try {
        clientWs.close(1008, 'unauthorized');
      } catch {
        /* noop */
      }
      return;
    }

    let sessionId: string | null = null;
    let dgWs: WebSocket | null = null;
    let finalizedParts: string[] = [];
    let turnInFlight = false;
    let closed = false;

    const setState = (state: RealtimeState) => {
      sendJson(clientWs, { type: 'state', state });
    };

    const closeDeepgram = () => {
      if (!dgWs) return;
      try {
        dgWs.close();
      } catch {
        /* noop */
      }
      dgWs = null;
    };

    const processTurnText = async (text: string) => {
      if (!sessionId) return;
      const transcript = text.trim();
      if (!transcript || turnInFlight) return;
      const session = getRubySession(sessionId);
      if (!session) {
        sendJson(clientWs, { type: 'error', message: 'Invalid or expired voice session' });
        return;
      }

      turnInFlight = true;
      setState('processing');
      try {
        const result = await runRubyVoiceTurn({
          session,
          forcedTranscript: transcript,
          includeDebug: process.env.NODE_ENV === 'development',
        });
        if (closed) return;

        touchRubySession(session);
        sendJson(clientWs, { type: 'assistant.partial', text: result.message });
        sendJson(clientWs, { type: 'assistant.final', text: result.message, mutations: result.mutations });
        setState('responding');
        sendJson(clientWs, {
          type: 'assistant.audio',
          audioBase64: result.audioBase64,
          audioMimeType: result.audioMimeType,
        });
        setState('listening');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process realtime voice turn';
        sendJson(clientWs, { type: 'error', message });
        setState('listening');
      } finally {
        turnInFlight = false;
      }
    };

    const openDeepgram = (sampleRate: number) => {
      const dgKey = readDeepgramKey();
      const url = deepgramWsUrl(sampleRate);
      dgWs = new WebSocket(url, {
        headers: {
          Authorization: `Token ${dgKey}`,
        },
      });

      dgWs.on('open', () => {
        setState('listening');
      });

      dgWs.on('message', (raw: RawData) => {
        if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return;
        let payload: DeepgramResultsEvent;
        try {
          payload = JSON.parse(raw.toString()) as DeepgramResultsEvent;
        } catch {
          return;
        }

        if (payload.type !== 'Results') return;
        const transcript = payload.channel?.alternatives?.[0]?.transcript?.trim() || '';
        if (!transcript) return;

        if (payload.is_final) {
          finalizedParts.push(transcript);
          sendJson(clientWs, { type: 'asr.final', text: transcript });
          if (payload.speech_final) {
            const utterance = finalizedParts.join(' ').replace(/\s+/g, ' ').trim();
            finalizedParts = [];
            void processTurnText(utterance);
          }
          return;
        }

        sendJson(clientWs, { type: 'asr.partial', text: transcript });
      });

      dgWs.on('error', (err: Error) => {
        const message = err instanceof Error ? err.message : 'Deepgram stream error';
        sendJson(clientWs, { type: 'error', message });
      });

      dgWs.on('close', () => {
        dgWs = null;
      });
    };

    clientWs.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        if (!dgWs || dgWs.readyState !== dgWs.OPEN) return;
        dgWs.send(data);
        return;
      }

      let msg: ClientInbound;
      try {
        msg = JSON.parse(data.toString()) as ClientInbound;
      } catch {
        sendJson(clientWs, { type: 'error', message: 'Invalid websocket payload' });
        return;
      }

      if (msg.type === 'session.start') {
        const sid = (msg.session_id || '').trim();
        const session = sid ? getRubySession(sid) : undefined;
        if (!session) {
          sendJson(clientWs, { type: 'error', message: 'Invalid or expired voice session' });
          return;
        }
        if (session.userId !== authUserId) {
          sendJson(clientWs, { type: 'error', message: 'Session does not belong to authenticated user' });
          return;
        }

        sessionId = sid;
        finalizedParts = [];
        const sampleRate = Number.isFinite(msg.sample_rate_hz) && (msg.sample_rate_hz || 0) > 0
          ? Number(msg.sample_rate_hz)
          : 16000;
        try {
          closeDeepgram();
          openDeepgram(sampleRate);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to initialize Deepgram';
          sendJson(clientWs, { type: 'error', message });
        }
        return;
      }

      if (msg.type === 'text.submit') {
        void processTurnText((msg.text || '').trim());
        return;
      }

      if (msg.type === 'session.end') {
        closeDeepgram();
        setState('idle');
      }
    });

    clientWs.on('close', () => {
      closed = true;
      closeDeepgram();
    });
  });
}
