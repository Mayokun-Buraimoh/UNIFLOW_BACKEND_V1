import type { PlanObjective } from '../models/Plan';

export interface ExamPrepFocusBlock {
  title: string;
  dueDateYmd: string;
  durationMinutes: number;
}

export interface ExamPrepProposal {
  proposalId: string;
  subject: string;
  courseDisplayName: string;
  courseCode: string;
  testDate: string;
  testTime: string;
  existingCourseId: string | null;
  planTitle: string;
  eventTitle: string;
  planTargets: PlanObjective[];
  planTasks: PlanObjective[];
  standaloneTasks: Array<{ title: string; dueDateYmd: string }>;
  focusBlocks: ExamPrepFocusBlock[];
  spokenSummary: string;
  /** Resolved course file for focus, if any files exist */
  suggestedNoteFileId: string | null;
  suggestedNoteCourseId: string | null;
}
