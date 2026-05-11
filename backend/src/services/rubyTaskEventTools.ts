import { Task } from '../models/Task';
import { Event } from '../models/Event';
import { scheduleEventReminderForEvent } from './eventReminderScheduler';

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

export async function executeRubyTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  timeZone: string,
  mutations: ToolMutationFlags
): Promise<string> {
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
      default:
        return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Tool execution failed';
    return JSON.stringify({ ok: false, error: msg });
  }
}
