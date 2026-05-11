import { randomUUID } from 'crypto';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const TTL_MS = 30 * 60 * 1000;

export interface RubySession {
  id: string;
  userId: string;
  timezone: string;
  firstName: string;
  messages: ChatCompletionMessageParam[];
  updatedAt: number;
}

const store = new Map<string, RubySession>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, s] of store) {
    if (now - s.updatedAt > TTL_MS) store.delete(id);
  }
}

export function createRubySession(userId: string, timezone: string, firstName: string, systemMessage: ChatCompletionMessageParam): RubySession {
  pruneExpired();
  const id = randomUUID();
  const session: RubySession = {
    id,
    userId,
    timezone: timezone || 'UTC',
    firstName,
    messages: [systemMessage],
    updatedAt: Date.now(),
  };
  store.set(id, session);
  return session;
}

export function getRubySession(sessionId: string): RubySession | undefined {
  pruneExpired();
  const s = store.get(sessionId);
  if (!s) return undefined;
  if (Date.now() - s.updatedAt > TTL_MS) {
    store.delete(sessionId);
    return undefined;
  }
  return s;
}

export function touchRubySession(session: RubySession): void {
  session.updatedAt = Date.now();
  store.set(session.id, session);
}

export function deleteRubySession(sessionId: string): void {
  store.delete(sessionId);
}

export function appendMessages(session: RubySession, msgs: ChatCompletionMessageParam[]): void {
  session.messages.push(...msgs);
  touchRubySession(session);
}
