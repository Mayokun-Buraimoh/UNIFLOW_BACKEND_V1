import { Course } from '../models/Course';
import CourseFile from '../models/CourseFile';

export type RubyFocusTechnique = 'pomodoro' | 'active_recall' | 'study_your_way';

export type RubyStartFocusIntent = {
  noteId: string;
  courseId: string;
  durationMinutes: number;
  technique: RubyFocusTechnique;
  dndEnabled: boolean;
};

async function findCourseBySubject(userId: string, subject: string): Promise<Course | null> {
  const normalized = subject.trim().toLowerCase();
  if (!normalized) return null;
  const courses = await Course.findAll({ where: { userId }, order: [['updatedAt', 'DESC']], limit: 50 });
  for (const c of courses) {
    const code = (c.code || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    if (code === normalized || name === normalized) return c;
    if (normalized.length >= 3 && (name.includes(normalized) || code.includes(normalized))) return c;
  }
  return null;
}

function pickCourseFile(
  files: CourseFile[],
  fileId?: string,
  fileName?: string
): CourseFile | null {
  if (fileId) {
    const byId = files.find((f) => f.id === fileId);
    if (byId) return byId;
  }
  if (fileName) {
    const needle = fileName.trim().toLowerCase();
    const byName = files.find((f) => f.originalName.toLowerCase().includes(needle));
    if (byName) return byName;
  }
  return files[0] ?? null;
}

export async function rubyListCourseFiles(userId: string, courseId: string) {
  const course = await Course.findOne({ where: { id: courseId, userId } });
  if (!course) return { ok: false as const, error: 'Course not found' };
  const files = await CourseFile.findAll({
    where: { courseId, userId },
    order: [['updatedAt', 'DESC']],
    limit: 30,
  });
  return {
    ok: true as const,
    courseId,
    courseName: course.name,
    files: files.map((f) => ({
      id: f.id,
      courseId: f.courseId,
      name: f.originalName,
      mimeType: f.mimeType,
    })),
  };
}

export async function resolveCourseFileForFocus(
  userId: string,
  input: { courseId?: string; subject?: string; noteId?: string; fileName?: string }
): Promise<{ ok: true; file: CourseFile; courseId: string } | { ok: false; error: string }> {
  let courseId = (input.courseId || '').trim();
  if (!courseId && input.subject) {
    const course = await findCourseBySubject(userId, input.subject);
    if (!course) return { ok: false, error: 'Course not found for subject' };
    courseId = course.id;
  }
  if (!courseId) return { ok: false, error: 'courseId or subject is required' };

  const listed = await rubyListCourseFiles(userId, courseId);
  if (!listed.ok) return { ok: false, error: listed.error };
  if (listed.files.length === 0) {
    return { ok: false, error: 'no_course_files' };
  }

  const files = await CourseFile.findAll({
    where: { courseId, userId },
    order: [['updatedAt', 'DESC']],
    limit: 30,
  });
  const picked = pickCourseFile(files, input.noteId, input.fileName);
  if (!picked) return { ok: false, error: 'Course file not found' };
  return { ok: true, file: picked, courseId };
}

export async function rubyStartFocusSession(
  userId: string,
  input: {
    courseId?: string;
    subject?: string;
    noteId?: string;
    fileName?: string;
    durationMinutes?: number;
    technique?: string;
    dndEnabled?: boolean;
  }
): Promise<
  | { ok: true; focus: RubyStartFocusIntent; fileName: string }
  | { ok: false; error: string }
> {
  const resolved = await resolveCourseFileForFocus(userId, input);
  if (!resolved.ok) return resolved;

  const durationMinutes = Math.max(1, Math.min(180, Number(input.durationMinutes) || 25));
  const techniqueRaw = (input.technique || 'pomodoro').trim().toLowerCase();
  const technique: RubyFocusTechnique =
    techniqueRaw === 'active_recall' || techniqueRaw === 'study_your_way' ? techniqueRaw : 'pomodoro';

  return {
    ok: true,
    fileName: resolved.file.originalName,
    focus: {
      noteId: resolved.file.id,
      courseId: resolved.courseId,
      durationMinutes,
      technique,
      dndEnabled: input.dndEnabled !== false,
    },
  };
}

export async function suggestNoteFileForCourse(
  userId: string,
  courseId: string
): Promise<{ noteFileId: string | null; courseId: string | null }> {
  const listed = await rubyListCourseFiles(userId, courseId);
  if (!listed.ok || listed.files.length === 0) {
    return { noteFileId: null, courseId: null };
  }
  return { noteFileId: listed.files[0]!.id, courseId };
}

export function isStartFocusTool(name: string): boolean {
  return name === 'start_focus_session';
}

export function parseStartFocusResult(content: string): RubyStartFocusIntent | null {
  try {
    const parsed = JSON.parse(content) as { ok?: boolean; focus?: RubyStartFocusIntent };
    if (parsed.ok && parsed.focus?.noteId && parsed.focus?.courseId) {
      return parsed.focus;
    }
  } catch {
    /* noop */
  }
  return null;
}
