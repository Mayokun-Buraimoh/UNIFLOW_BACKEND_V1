import { Course } from '../models/Course';
import { Event } from '../models/Event';
import { Task } from '../models/Task';
import { WeeklySchedule } from '../models/WeeklySchedule';
import {
  createPlanForUser,
  deletePlanForUser,
  getPlanForUser,
  listPlansForUser,
  updatePlanForUser,
} from './planService';
import type { ToolMutationFlags } from './rubyTaskEventTools';

export type RubyNavigateIntent = { path: string; mode: 'root' | 'forward' };

const SCREEN_PATHS: Record<string, { path: string; mode: 'root' | 'forward' }> = {
  home: { path: '/home', mode: 'root' },
  plans: { path: '/plans', mode: 'root' },
  courses: { path: '/courses', mode: 'root' },
  settings: { path: '/settings', mode: 'root' },
  chatbot: { path: '/chatbot', mode: 'forward' },
  weekly_schedule: { path: '/weekly-schedule', mode: 'root' },
  analytics: { path: '/analytics', mode: 'root' },
  profile: { path: '/profile', mode: 'root' },
};

/** Tab/screen path resolution (no DB). Used by navigate_to for non-resource screens. */
export function resolveRubyTabScreen(
  screen: string
): { ok: true; path: string; mode: 'root' | 'forward' } | { ok: false; error: string } {
  const target = SCREEN_PATHS[screen.trim().toLowerCase()];
  if (!target) {
    return {
      ok: false,
      error: `Unknown screen: ${screen}. Use home, plans, courses, settings, chatbot, weekly_schedule, analytics, profile, plan, or course.`,
    };
  }
  return { ok: true, path: target.path, mode: target.mode };
}

export async function rubyNavigateTo(
  userId: string,
  input: { screen: string; planId?: string; courseId?: string }
): Promise<{ ok: boolean; path?: string; mode?: 'root' | 'forward'; error?: string }> {
  const screen = (input.screen || '').trim().toLowerCase();
  if (screen === 'plan') {
    const planId = (input.planId || '').trim();
    if (!planId) return { ok: false, error: 'planId is required when screen is plan' };
    const plan = await getPlanForUser(userId, planId);
    if (!plan) return { ok: false, error: 'Plan not found' };
    return { ok: true, path: `/plans/${planId}`, mode: 'root' };
  }
  if (screen === 'course') {
    const courseId = (input.courseId || '').trim();
    if (!courseId) return { ok: false, error: 'courseId is required when screen is course' };
    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return { ok: false, error: 'Course not found' };
    return { ok: true, path: `/course/${courseId}`, mode: 'root' };
  }
  const target = resolveRubyTabScreen(screen);
  if (!target.ok) return { ok: false, error: target.error };
  return { ok: true, path: target.path, mode: target.mode };
}

export async function rubyListPlans(userId: string) {
  const plans = await listPlansForUser(userId);
  return { ok: true, plans };
}

export async function rubyGetPlan(userId: string, planId: string) {
  const plan = await getPlanForUser(userId, planId);
  if (!plan) return { ok: false, error: 'Plan not found' };
  return { ok: true, plan };
}

export async function rubyCreatePlan(
  userId: string,
  input: { title: string; isCustom?: boolean },
  mutations: ToolMutationFlags
) {
  try {
    const plan = await createPlanForUser(userId, input);
    mutations.plans = true;
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create plan' };
  }
}

export async function rubyUpdatePlan(
  userId: string,
  input: { planId: string; title?: string; targets?: unknown; tasks?: unknown },
  mutations: ToolMutationFlags
) {
  const plan = await updatePlanForUser(userId, input.planId, {
    title: input.title,
    targets: Array.isArray(input.targets) ? (input.targets as never) : undefined,
    tasks: Array.isArray(input.tasks) ? (input.tasks as never) : undefined,
  });
  if (!plan) return { ok: false, error: 'Plan not found' };
  mutations.plans = true;
  return { ok: true, plan };
}

export async function rubyDeletePlan(userId: string, planId: string, mutations: ToolMutationFlags) {
  const ok = await deletePlanForUser(userId, planId);
  if (!ok) return { ok: false, error: 'Plan not found' };
  mutations.plans = true;
  return { ok: true };
}

export async function rubyListCourses(userId: string) {
  const courses = await Course.findAll({
    where: { userId },
    order: [['updatedAt', 'DESC']],
    limit: 50,
  });
  return {
    ok: true,
    courses: courses.map((c) => ({ id: c.id, name: c.name, code: c.code, color: c.color })),
  };
}

export async function rubyGetCourse(userId: string, courseId: string) {
  const course = await Course.findOne({ where: { id: courseId, userId } });
  if (!course) return { ok: false, error: 'Course not found' };
  return {
    ok: true,
    course: { id: course.id, name: course.name, code: course.code, color: course.color },
  };
}

export async function rubyCreateCourse(
  userId: string,
  input: { name: string; code?: string; color?: string },
  mutations: ToolMutationFlags
) {
  const name = (input.name || '').trim();
  if (!name) return { ok: false, error: 'Course name is required' };
  const code = (input.code || name.slice(0, 8).toUpperCase().replace(/\s+/g, '')).trim();
  const colors = ['#4A90E2', '#50C878', '#FF6B6B', '#FFA07A', '#20B2AA'];
  const colorIndex = code.charCodeAt(0) % colors.length;
  const course = await Course.create({
    userId,
    code,
    name,
    color: input.color || colors[colorIndex],
    iconColor: '#FFFFFF',
    fileIcon: '/assets/icons/course-icon.svg',
    week: 1,
    visible: true,
  });
  mutations.courses = true;
  return { ok: true, course: { id: course.id, name: course.name, code: course.code } };
}

export async function rubyGetWeeklySchedule(userId: string) {
  const schedule = await WeeklySchedule.findOne({ where: { userId } });
  if (!schedule) return { ok: true, hasSchedule: false, data: null };
  return { ok: true, hasSchedule: true, data: schedule.data };
}

export async function rubyUpdateWeeklySchedule(
  userId: string,
  data: Record<string, unknown>,
  mutations: ToolMutationFlags
) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid schedule data' };
  const clean: Record<string, string[]> = {};
  for (const [day, rows] of Object.entries(data)) {
    if (!Array.isArray(rows)) continue;
    clean[day] = rows.map((r) => (typeof r === 'string' ? r : ''));
  }
  const existing = await WeeklySchedule.findOne({ where: { userId } });
  if (existing) {
    await existing.update({ data: clean });
    mutations.schedule = true;
    return { ok: true, data: existing.data };
  }
  const created = await WeeklySchedule.create({ userId, data: clean });
  mutations.schedule = true;
  return { ok: true, data: created.data };
}

export async function rubyDeleteTask(userId: string, taskId: string, mutations: ToolMutationFlags) {
  const deleted = await Task.destroy({ where: { id: taskId, userId } });
  if (!deleted) return { ok: false, error: 'Task not found' };
  mutations.tasks = true;
  return { ok: true };
}

export async function rubyToggleTask(userId: string, taskId: string, mutations: ToolMutationFlags) {
  const task = await Task.findOne({ where: { id: taskId, userId } });
  if (!task) return { ok: false, error: 'Task not found' };
  const next = task.status === 'completed' ? 'pending' : 'completed';
  await task.update({
    status: next,
    completedAt: next === 'completed' ? new Date() : undefined,
  });
  mutations.tasks = true;
  return { ok: true, task: { id: task.id, status: next } };
}

export async function rubyUpdateEvent(
  userId: string,
  input: { eventId: string; title?: string; time?: string; date?: string; priority?: string },
  mutations: ToolMutationFlags
) {
  const event = await Event.findOne({ where: { id: input.eventId, userId } });
  if (!event) return { ok: false, error: 'Event not found' };
  const patch: Record<string, string> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.time !== undefined) patch.time = input.time.trim();
  if (input.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: 'date must be YYYY-MM-DD' };
    patch.date = input.date.trim();
  }
  if (input.priority !== undefined) {
    if (!['low', 'medium', 'critical'].includes(input.priority)) return { ok: false, error: 'Invalid priority' };
    patch.priority = input.priority;
  }
  await event.update(patch);
  mutations.events = true;
  return {
    ok: true,
    event: { id: event.id, title: event.title, time: event.time, date: event.date },
  };
}

export async function rubyDeleteEvent(userId: string, eventId: string, mutations: ToolMutationFlags) {
  const deleted = await Event.destroy({ where: { id: eventId, userId } });
  if (!deleted) return { ok: false, error: 'Event not found' };
  mutations.events = true;
  return { ok: true };
}

export function isNavigateTool(name: string): boolean {
  return name === 'navigate_to' || name === 'navigate_app';
}

export function parseNavigateResult(content: string): RubyNavigateIntent | null {
  try {
    const parsed = JSON.parse(content) as { ok?: boolean; path?: string; mode?: string };
    if (parsed.ok && parsed.path) {
      return { path: parsed.path, mode: parsed.mode === 'forward' ? 'forward' : 'root' };
    }
  } catch {
    /* noop */
  }
  return null;
}

export function hasAnyMutation(m: ToolMutationFlags): boolean {
  return !!(m.tasks || m.events || m.plans || m.courses || m.schedule);
}
