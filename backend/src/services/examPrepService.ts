import { randomUUID } from 'crypto';
import { Course } from '../models/Course';
import type { PlanObjective } from '../models/Plan';
import type { ExamPrepProposal } from './examPrepTypes';
import {
  clearSessionExamPrepProposal,
  getSessionExamPrepProposal,
  setSessionExamPrepProposal,
  type RubySession,
} from './rubySessionStore';
import { createPlanForUser, newObjectiveId, updatePlanForUser } from './planService';
import { rubyCreateCourse } from './rubyAppTools';
import { rubyCreateEvent, rubyCreateTask, todayYmd, type ToolMutationFlags } from './rubyTaskEventTools';
import { rubyStartFocusSession, suggestNoteFileForCourse } from './rubyFocusTools';

export type { ExamPrepProposal } from './examPrepTypes';

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00Z`);
  const b = new Date(`${toYmd}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function deriveCourseCode(subject: string): string {
  const trimmed = subject.trim();
  if (/^[A-Za-z]{2,4}\s*\d{2,4}[A-Za-z]?$/.test(trimmed)) {
    return trimmed.replace(/\s+/g, '').toUpperCase();
  }
  return trimmed.slice(0, 8).toUpperCase().replace(/\s+/g, '') || 'COURSE';
}

function deriveCourseName(subject: string, courseName?: string): string {
  if (courseName?.trim()) return courseName.trim();
  const trimmed = subject.trim();
  if (/^[A-Za-z]{2,4}\s*\d/.test(trimmed)) return trimmed.replace(/\s+/g, ' ').toUpperCase();
  return trimmed;
}

async function findMatchingCourse(userId: string, subject: string): Promise<Course | null> {
  const normalized = subject.trim().toLowerCase();
  const courses = await Course.findAll({ where: { userId }, order: [['updatedAt', 'DESC']], limit: 50 });
  for (const c of courses) {
    const code = (c.code || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    if (code === normalized || name === normalized) return c;
    if (normalized.length >= 3 && (name.includes(normalized) || code.includes(normalized))) return c;
  }
  return null;
}

/** Build review due dates strictly before the test date. */
export function buildReviewDueDates(testDateYmd: string, todayYmd: string): string[] {
  const daysUntil = daysBetween(todayYmd, testDateYmd);
  if (daysUntil < 0) return [];

  const dates: string[] = [];
  if (daysUntil >= 3) {
    dates.push(addDaysToYmd(testDateYmd, -3), addDaysToYmd(testDateYmd, -2), addDaysToYmd(testDateYmd, -1));
  } else if (daysUntil === 2) {
    dates.push(addDaysToYmd(testDateYmd, -2), addDaysToYmd(testDateYmd, -1));
  } else if (daysUntil === 1) {
    dates.push(addDaysToYmd(testDateYmd, -1));
  } else {
    dates.push(todayYmd);
  }
  return dates.filter((d) => d <= testDateYmd);
}

function reviewTaskTitles(subject: string, count: number): string[] {
  const label = subject.trim();
  const templates = [
    `Review ${label} notes`,
    `Practice ${label} problems`,
    `Quick ${label} review before test`,
  ];
  return templates.slice(0, count);
}

export async function proposeExamPrep(
  session: RubySession,
  input: {
    subject: string;
    testDate: string;
    testTime?: string;
    courseName?: string;
    includeFocusSessions?: boolean;
    focusDurationMinutes?: number;
  }
): Promise<
  | { ok: true; proposal: ExamPrepProposal; summary: string }
  | { ok: false; error: string }
> {
  const subject = (input.subject || '').trim();
  const testDate = (input.testDate || '').trim();
  const testTime = (input.testTime || '09:00').trim() || '09:00';
  const includeFocus = input.includeFocusSessions !== false;
  const focusDuration = Math.max(15, Math.min(90, Number(input.focusDurationMinutes) || 25));

  if (!subject) return { ok: false, error: 'subject is required (course code or name)' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
    return { ok: false, error: 'testDate must be YYYY-MM-DD' };
  }

  const tz = session.timezone || 'UTC';
  const today = todayYmd(tz);
  if (daysBetween(today, testDate) < 0) {
    return { ok: false, error: 'test_date_in_past' };
  }

  const existing = await findMatchingCourse(session.userId, subject);
  const courseCode = existing?.code || deriveCourseCode(subject);
  const courseDisplayName = existing?.name || deriveCourseName(subject, input.courseName);
  const planTitle = `${courseDisplayName} Test Prep`;
  const eventTitle = `${courseDisplayName} Test`;

  const reviewDates = buildReviewDueDates(testDate, today);
  const reviewTitles = reviewTaskTitles(courseDisplayName, reviewDates.length);

  const planTargets: PlanObjective[] = [
    { id: newObjectiveId(), title: `Complete all review before ${testDate}`, completed: false },
  ];

  const planTasks: PlanObjective[] = reviewTitles.map((title, i) => ({
    id: newObjectiveId(),
    title,
    completed: false,
    date: reviewDates[i],
  }));

  const standaloneTasks = reviewTitles.map((title, i) => ({
    title,
    dueDateYmd: reviewDates[i]!,
  }));

  const focusBlocks = includeFocus
    ? reviewDates.map((dueDateYmd, i) => ({
        title: `Focus session: ${reviewTitles[i]}`,
        dueDateYmd,
        durationMinutes: focusDuration,
      }))
    : [];

  if (includeFocus) {
    for (let i = 0; i < focusBlocks.length; i++) {
      standaloneTasks.push({
        title: focusBlocks[i]!.title,
        dueDateYmd: focusBlocks[i]!.dueDateYmd,
      });
    }
  }

  let suggestedNoteFileId: string | null = null;
  let suggestedNoteCourseId: string | null = null;
  if (existing) {
    const suggested = await suggestNoteFileForCourse(session.userId, existing.id);
    suggestedNoteFileId = suggested.noteFileId;
    suggestedNoteCourseId = suggested.courseId;
  }

  const courseLine = existing
    ? `use your existing ${courseDisplayName} course`
    : `create a ${courseDisplayName} course folder`;
  const taskLines = reviewTitles.map((t, i) => `${t} (due ${reviewDates[i]})`).join('; ');
  const focusLine = includeFocus
    ? ` I'll also add ${focusBlocks.length} focus session task${focusBlocks.length === 1 ? '' : 's'} (${focusDuration} min each).`
    : '';

  const spokenSummary =
    `I'll ${courseLine}, add "${eventTitle}" on ${testDate} at ${testTime}, ` +
    `create a "${planTitle}" plan, and schedule: ${taskLines}.${focusLine}`;

  const proposal: ExamPrepProposal = {
    proposalId: randomUUID(),
    subject,
    courseDisplayName,
    courseCode,
    testDate,
    testTime,
    existingCourseId: existing?.id ?? null,
    planTitle,
    eventTitle,
    planTargets,
    planTasks,
    standaloneTasks,
    focusBlocks,
    spokenSummary,
    suggestedNoteFileId,
    suggestedNoteCourseId,
  };

  setSessionExamPrepProposal(session, proposal);

  return { ok: true, proposal, summary: spokenSummary };
}

export async function confirmExamPrep(
  session: RubySession,
  input: {
    confirmed: boolean;
    startFocusNow?: boolean;
    noteId?: string;
    fileName?: string;
    focusDurationMinutes?: number;
    technique?: string;
  },
  mutations: ToolMutationFlags
): Promise<Record<string, unknown>> {
  if (!input.confirmed) {
    clearSessionExamPrepProposal(session);
    return { ok: true, cancelled: true };
  }

  const proposal = getSessionExamPrepProposal(session);
  if (!proposal) {
    return { ok: false, error: 'no_pending_proposal' };
  }

  try {
    let courseId = proposal.existingCourseId;
    if (!courseId) {
      const created = await rubyCreateCourse(
        session.userId,
        { name: proposal.courseDisplayName, code: proposal.courseCode },
        mutations
      );
      if (!created.ok || !created.course) {
        return { ok: false, error: created.ok ? 'Failed to create course' : created.error || 'Failed to create course' };
      }
      courseId = created.course.id;
    }

    const eventResult = await rubyCreateEvent(
      session.userId,
      {
        title: proposal.eventTitle,
        time: proposal.testTime,
        date: proposal.testDate,
        priority: 'critical',
      },
      mutations
    );
    if (!eventResult.ok) {
      return { ok: false, error: eventResult.error || 'Failed to create test event' };
    }

    const planRecord = await createPlanForUser(session.userId, {
      title: proposal.planTitle,
      isCustom: true,
    });
    mutations.plans = true;
    const planId = String(planRecord.id);

    const updatedPlan = await updatePlanForUser(session.userId, planId, {
      targets: proposal.planTargets,
      tasks: proposal.planTasks,
    });
    if (!updatedPlan) {
      return { ok: false, error: 'Failed to update prep plan' };
    }

    const createdTasks: Record<string, unknown>[] = [];
    for (const t of proposal.standaloneTasks) {
      const dueDate = `${t.dueDateYmd}T18:00:00.000Z`;
      const taskResult = await rubyCreateTask(
        session.userId,
        { title: t.title, dueDate, priority: 'medium' },
        mutations
      );
      if (taskResult.ok) createdTasks.push(taskResult.task);
    }

    clearSessionExamPrepProposal(session);

    const result: Record<string, unknown> = {
      ok: true,
      courseId,
      event: eventResult.event,
      plan: updatedPlan,
      tasks: createdTasks,
      message: `Exam prep set up for ${proposal.courseDisplayName} on ${proposal.testDate}.`,
    };

    if (input.startFocusNow) {
      const focusResult = await rubyStartFocusSession(session.userId, {
        courseId: courseId ?? undefined,
        noteId: input.noteId || proposal.suggestedNoteFileId || undefined,
        fileName: input.fileName,
        durationMinutes: input.focusDurationMinutes || proposal.focusBlocks[0]?.durationMinutes || 25,
        technique: input.technique,
      });
      if (focusResult.ok) {
        result.focus = focusResult.focus;
        result.focusFileName = focusResult.fileName;
      } else {
        result.focusError = focusResult.error;
      }
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to execute exam prep';
    return { ok: false, error: msg };
  }
}
