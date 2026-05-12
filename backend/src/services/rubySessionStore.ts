import { randomUUID } from 'crypto';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const TTL_MS = 30 * 60 * 1000;

/**
 * Day keys used by the on-device weekly schedule. `Thur` (not `Thu`) is
 * intentional — it matches the legacy localStorage schema the frontend
 * already ships, so we don't have to migrate every device.
 */
export type WeeklyScheduleDayKey =
  | 'Mon'
  | 'Tue'
  | 'Wed'
  | 'Thur'
  | 'Fri'
  | 'Sat'
  | 'Sun';

/**
 * Snapshot of the user's weekly schedule, captured on the client and shipped
 * up at session start (and on `weeklyScheduleUpdated` mid-session). Treat
 * this as opaque from the controller's POV — the orchestrator's
 * `get_todays_classes` tool is the only consumer.
 */
export interface WeeklyScheduleSnapshot {
  grid: Record<WeeklyScheduleDayKey, string[]>;
  timeSlots: string[];
  venues: Record<WeeklyScheduleDayKey, string[]>;
  capturedAt: string;
}

export interface RubySession {
  id: string;
  userId: string;
  timezone: string;
  firstName: string;
  messages: ChatCompletionMessageParam[];
  weeklySchedule?: WeeklyScheduleSnapshot;
  updatedAt: number;
}

const store = new Map<string, RubySession>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, s] of store) {
    if (now - s.updatedAt > TTL_MS) store.delete(id);
  }
}

export function createRubySession(
  userId: string,
  timezone: string,
  firstName: string,
  systemMessage: ChatCompletionMessageParam,
  weeklySchedule?: WeeklyScheduleSnapshot
): RubySession {
  pruneExpired();
  const id = randomUUID();
  const session: RubySession = {
    id,
    userId,
    timezone: timezone || 'UTC',
    firstName,
    messages: [systemMessage],
    weeklySchedule,
    updatedAt: Date.now(),
  };
  store.set(id, session);
  return session;
}

export function setSessionWeeklySchedule(
  session: RubySession,
  weeklySchedule: WeeklyScheduleSnapshot | undefined
): void {
  session.weeklySchedule = weeklySchedule;
  touchRubySession(session);
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
