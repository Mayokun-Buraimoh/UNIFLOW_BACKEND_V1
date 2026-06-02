import { Task } from '../models/Task';
import { Event } from '../models/Event';
import { scheduleEventReminderForEvent } from './eventReminderScheduler';
import type {
  RubySession,
  WeeklyScheduleDayKey,
  WeeklyScheduleSnapshot,
} from './rubySessionStore';

export interface DayOverviewResult {
  date: string;
  timezone: string;
  tasks: Record<string, unknown>[];
  events: Record<string, unknown>[];
}

export function ymdInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Today YYYY-MM-DD in user's timezone. */
export function todayYmd(timeZone: string): string {
  return ymdInTimeZone(new Date(), timeZone);
}

function taskMatchesDay(
  task: Task,
  targetYmd: string,
  timeZone: string
): boolean {
  const anchor = task.dueDate ? new Date(task.dueDate) : new Date(task.createdAt);
  return ymdInTimeZone(anchor, timeZone) === targetYmd;
}

function serializeTask(t: Task): Record<string, unknown> {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
  };
}

function serializeEvent(e: Event): Record<string, unknown> {
  return {
    id: e.id,
    title: e.title,
    time: e.time,
    date: e.date,
    priority: e.priority,
  };
}

export async function getDayOverview(
  userId: string,
  dateYmd: string | undefined,
  timeZone: string
): Promise<DayOverviewResult> {
  const date = (dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd) ? dateYmd : todayYmd(timeZone)) as string;

  const [allTasks, events] = await Promise.all([
    Task.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 80,
    }),
    Event.findAll({
      where: { userId, date },
      order: [['time', 'ASC']],
    }),
  ]);

  const tasksForDay = allTasks.filter((t) => taskMatchesDay(t, date, timeZone));

  return {
    date,
    timezone: timeZone,
    tasks: tasksForDay.map(serializeTask),
    events: events.map(serializeEvent),
  };
}

export type ToolMutationFlags = { tasks: boolean; events: boolean };

const RUBY_APP_TAB_PATHS: Record<string, { path: string; mode: 'root' | 'forward' }> = {
  home: { path: '/home', mode: 'root' },
  plans: { path: '/plans', mode: 'root' },
  courses: { path: '/courses', mode: 'root' },
  settings: { path: '/settings', mode: 'root' },
  chatbot: { path: '/chatbot', mode: 'forward' },
};

export function rubyNavigateApp(tab: string): { ok: boolean; path?: string; mode?: 'root' | 'forward'; tab?: string; error?: string } {
  const key = tab.trim().toLowerCase();
  const target = RUBY_APP_TAB_PATHS[key];
  if (!target) {
    return { ok: false, error: `Unknown tab: ${tab}. Use home, plans, courses, settings, or chatbot.` };
  }
  return { ok: true, path: target.path, mode: target.mode, tab: key };
}

export async function rubyCreateTask(
  userId: string,
  input: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    dueDate?: string;
  },
  mutations: ToolMutationFlags
): Promise<{ ok: true; task: Record<string, unknown> } | { ok: false; error: string }> {
  const title = (input.title || '').trim();
  if (!title) return { ok: false, error: 'Task title is required' };
  if (title.length > 100) return { ok: false, error: 'Task title must be 100 characters or less' };
  const priority = input.priority;
  if (priority && !['low', 'medium', 'critical'].includes(priority)) {
    return { ok: false, error: 'Invalid priority' };
  }
  const status = input.status;
  if (status && !['pending', 'in_progress', 'completed'].includes(status)) {
    return { ok: false, error: 'Invalid status' };
  }

  let dueDate: Date | undefined;
  if (input.dueDate) {
    const d = new Date(input.dueDate);
    if (!Number.isNaN(d.getTime())) dueDate = d;
  }

  const task = await Task.create({
    userId,
    title,
    description: input.description?.trim() || undefined,
    priority: (priority as 'low' | 'medium' | 'critical') || 'low',
    status: (status as 'pending' | 'in_progress' | 'completed') || 'pending',
    dueDate,
  });
  mutations.tasks = true;
  return { ok: true, task: serializeTask(task) };
}

export async function rubyUpdateTask(
  userId: string,
  input: {
    taskId: string;
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
    dueDate?: string | null;
  },
  mutations: ToolMutationFlags
): Promise<{ ok: true; task: Record<string, unknown> } | { ok: false; error: string }> {
  const task = await Task.findOne({ where: { id: input.taskId, userId } });
  if (!task) return { ok: false, error: 'Task not found' };

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { ok: false, error: 'Task title cannot be empty' };
    if (t.length > 100) return { ok: false, error: 'Task title must be 100 characters or less' };
    patch.title = t;
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.priority !== undefined) {
    if (!['low', 'medium', 'critical'].includes(input.priority)) return { ok: false, error: 'Invalid priority' };
    patch.priority = input.priority;
  }
  if (input.status !== undefined) {
    if (!['pending', 'in_progress', 'completed'].includes(input.status)) return { ok: false, error: 'Invalid status' };
    patch.status = input.status;
    if (input.status === 'completed') patch.completedAt = new Date();
    else patch.completedAt = null;
  }
  if (input.dueDate !== undefined) {
    if (input.dueDate === null || input.dueDate === '') patch.dueDate = null;
    else {
      const d = new Date(input.dueDate);
      if (Number.isNaN(d.getTime())) return { ok: false, error: 'Invalid dueDate' };
      patch.dueDate = d;
    }
  }

  await Task.update(patch, { where: { id: input.taskId, userId } });
  const updated = await Task.findOne({ where: { id: input.taskId, userId } });
  if (!updated) return { ok: false, error: 'Task not found' };
  mutations.tasks = true;
  return { ok: true, task: serializeTask(updated) };
}

export async function rubyCreateEvent(
  userId: string,
  input: { title: string; time: string; date: string; priority?: string },
  mutations: ToolMutationFlags
): Promise<{ ok: true; event: Record<string, unknown> } | { ok: false; error: string }> {
  const title = (input.title || '').trim();
  const time = (input.time || '').trim();
  const date = (input.date || '').trim();
  if (!title || !time || !date) {
    return { ok: false, error: 'Title, time, and date are required (YYYY-MM-DD for date)' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'date must be YYYY-MM-DD' };
  }
  const priority = input.priority || 'low';
  if (!['low', 'medium', 'critical'].includes(priority)) {
    return { ok: false, error: 'Invalid priority' };
  }

  const event = await Event.create({
    userId,
    title,
    time,
    date,
    priority: priority as 'low' | 'medium' | 'critical',
  });
  void scheduleEventReminderForEvent(event);
  mutations.events = true;
  return { ok: true, event: serializeEvent(event) };
}

/* ---------- Today's classes (weekly schedule) ---------- */

const JS_DAY_TO_KEY: Record<number, WeeklyScheduleDayKey> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thur',
  5: 'Fri',
  6: 'Sat',
};

/**
 * Get the user's local day-of-week key (Mon..Sun, with `Thur` for Thursday)
 * for "now" in their IANA time zone.
 */
function todayWeekdayKey(timeZone: string): WeeklyScheduleDayKey {
  const tz = timeZone || 'UTC';
  // `en-US` short weekday is Sun/Mon/.../Sat — easier to map via the JS day
  // index than to special-case "Thur" vs "Thu" string slicing.
  const partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  });
  const short = partsFmt.format(new Date());
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
  return JS_DAY_TO_KEY[idx >= 0 ? idx : 0]!;
}

/** Minutes since 00:00 in the user's timezone for the current instant. */
function nowMinutesInTimeZone(timeZone: string): number {
  const tz = timeZone || 'UTC';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === 'hour')?.value || '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value || '0');
  return hh * 60 + mm;
}

/** Parse "HH:MM - HH:MM" → start/end minutes-since-midnight. */
function parseSlotMinutes(slot: string): { startMin: number; endMin: number } | null {
  if (typeof slot !== 'string') return null;
  const m = slot.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const startMin = Number(m[1]) * 60 + Number(m[2]);
  const endMin = Number(m[3]) * 60 + Number(m[4]);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
  return { startMin, endMin };
}

function formatMinutesAsTime(min: number): string {
  const safe = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface TodaysClassesResult {
  ok: true;
  hasSchedule: boolean;
  date: string;
  timezone: string;
  weekdayKey: WeeklyScheduleDayKey;
  weekdayName: string;
  totalToday: number;
  finished: number;
  inProgress: number;
  upcoming: number;
  classes: Array<{
    title: string;
    venue: string | null;
    slot: string;
    startTime: string;
    endTime: string;
    status: 'finished' | 'in_progress' | 'upcoming';
  }>;
  currentClass: {
    title: string;
    venue: string | null;
    slot: string;
    endsInMinutes: number;
  } | null;
  nextClass: {
    title: string;
    venue: string | null;
    slot: string;
    startsInMinutes: number;
  } | null;
}

/**
 * Compute "today's classes" using the weekly-schedule snapshot the client
 * shipped at session start (or via `refresh_schedule`). Returns a structured
 * payload Ruby can use to answer "how many classes do I have today?",
 * "how many are left?", "what's my next class?", etc.
 */
export function rubyGetTodaysClasses(
  session: RubySession
):
  | TodaysClassesResult
  | { ok: false; error: 'no_schedule_provided'; hasSchedule: false } {
  const snapshot: WeeklyScheduleSnapshot | undefined = session.weeklySchedule;
  if (!snapshot) {
    return { ok: false, error: 'no_schedule_provided', hasSchedule: false };
  }

  const tz = session.timezone || 'UTC';
  const weekdayKey = todayWeekdayKey(tz);
  const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date());
  const today = todayYmd(tz);
  const nowMin = nowMinutesInTimeZone(tz);

  const dayClasses: string[] = Array.isArray(snapshot.grid?.[weekdayKey]) ? snapshot.grid[weekdayKey] : [];
  const dayVenues: string[] = Array.isArray(snapshot.venues?.[weekdayKey]) ? snapshot.venues[weekdayKey] : [];
  const slots: string[] = Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [];

  const classes: TodaysClassesResult['classes'] = [];
  let finished = 0;
  let inProgress = 0;
  let upcoming = 0;
  let currentClass: TodaysClassesResult['currentClass'] = null;
  let nextClass: TodaysClassesResult['nextClass'] = null;
  let nextStartMin = Number.POSITIVE_INFINITY;

  for (let i = 0; i < dayClasses.length; i++) {
    const title = (dayClasses[i] || '').trim();
    if (!title) continue;
    const slot = slots[i] || '';
    const parsed = parseSlotMinutes(slot);
    if (!parsed) {
      // No time data for this row — count it but mark it as `upcoming` so we
      // don't lose visibility of the class entirely.
      classes.push({ title, venue: (dayVenues[i] || '').trim() || null, slot, startTime: '', endTime: '', status: 'upcoming' });
      upcoming += 1;
      continue;
    }
    const { startMin, endMin } = parsed;
    let status: 'finished' | 'in_progress' | 'upcoming';
    if (nowMin >= endMin) {
      status = 'finished';
      finished += 1;
    } else if (nowMin >= startMin) {
      status = 'in_progress';
      inProgress += 1;
      if (!currentClass) {
        currentClass = {
          title,
          venue: (dayVenues[i] || '').trim() || null,
          slot,
          endsInMinutes: Math.max(0, endMin - nowMin),
        };
      }
    } else {
      status = 'upcoming';
      upcoming += 1;
      if (startMin < nextStartMin) {
        nextStartMin = startMin;
        nextClass = {
          title,
          venue: (dayVenues[i] || '').trim() || null,
          slot,
          startsInMinutes: Math.max(0, startMin - nowMin),
        };
      }
    }
    classes.push({
      title,
      venue: (dayVenues[i] || '').trim() || null,
      slot,
      startTime: formatMinutesAsTime(startMin),
      endTime: formatMinutesAsTime(endMin),
      status,
    });
  }

  return {
    ok: true,
    hasSchedule: true,
    date: today,
    timezone: tz,
    weekdayKey,
    weekdayName,
    totalToday: classes.length,
    finished,
    inProgress,
    upcoming,
    classes,
    currentClass,
    nextClass,
  };
}

export async function executeRubyTool(
  name: string,
  args: Record<string, unknown>,
  session: RubySession,
  mutations: ToolMutationFlags
): Promise<string> {
  const userId = session.userId;
  const timeZone = session.timezone;
  try {
    switch (name) {
      case 'get_day_overview': {
        const date = typeof args.date === 'string' ? args.date : undefined;
        const overview = await getDayOverview(userId, date, timeZone);
        return JSON.stringify(overview);
      }
      case 'create_task': {
        const r = await rubyCreateTask(
          userId,
          {
            title: String(args.title ?? ''),
            description: args.description != null ? String(args.description) : undefined,
            priority: args.priority != null ? String(args.priority) : undefined,
            status: args.status != null ? String(args.status) : undefined,
            dueDate: args.dueDate != null ? String(args.dueDate) : undefined,
          },
          mutations
        );
        return JSON.stringify(r);
      }
      case 'update_task': {
        const r = await rubyUpdateTask(
          userId,
          {
            taskId: String(args.taskId ?? ''),
            title: args.title != null ? String(args.title) : undefined,
            description: args.description != null ? String(args.description) : undefined,
            priority: args.priority != null ? String(args.priority) : undefined,
            status: args.status != null ? String(args.status) : undefined,
            dueDate: args.dueDate !== undefined ? (args.dueDate === null ? null : String(args.dueDate)) : undefined,
          },
          mutations
        );
        return JSON.stringify(r);
      }
      case 'create_event': {
        const r = await rubyCreateEvent(
          userId,
          {
            title: String(args.title ?? ''),
            time: String(args.time ?? ''),
            date: String(args.date ?? ''),
            priority: args.priority != null ? String(args.priority) : undefined,
          },
          mutations
        );
        return JSON.stringify(r);
      }
      case 'get_todays_classes': {
        return JSON.stringify(rubyGetTodaysClasses(session));
      }
      case 'navigate_app': {
        return JSON.stringify(rubyNavigateApp(String(args.tab ?? '')));
      }
      default:
        return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Tool execution failed';
    return JSON.stringify({ ok: false, error: msg });
  }
}
