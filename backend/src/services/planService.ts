import { randomUUID } from 'crypto';
import { Plan, type PlanObjective } from '../models/Plan';

function normalizeObjective(objective: PlanObjective): PlanObjective {
  if (!objective.completed) {
    return { ...objective, completedAt: undefined };
  }
  return {
    ...objective,
    completedAt: objective.completedAt || new Date().toISOString(),
  };
}

export function calculatePlanProgress(targets: PlanObjective[], tasks: PlanObjective[]): number {
  const total = targets.length + tasks.length;
  if (total === 0) return 0;
  const completed =
    targets.filter((t) => t.completed).length + tasks.filter((t) => t.completed).length;
  return Math.round((completed / total) * 100);
}

export function withComputedProgress(plan: Plan): Record<string, unknown> {
  const targets = (plan.targets || []).map(normalizeObjective);
  const tasks = (plan.tasks || []).map(normalizeObjective);
  return {
    id: plan.id,
    title: plan.title,
    isCustom: plan.isCustom,
    bannerImage: plan.bannerImage,
    targets,
    tasks,
    progress: calculatePlanProgress(targets, tasks),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export async function listPlansForUser(userId: string): Promise<Record<string, unknown>[]> {
  const plans = await Plan.findAll({
    where: { userId },
    order: [['updatedAt', 'DESC']],
  });
  return plans.map((p) => withComputedProgress(p));
}

export async function getPlanForUser(
  userId: string,
  planId: string
): Promise<Record<string, unknown> | null> {
  const plan = await Plan.findOne({ where: { id: planId, userId } });
  if (!plan) return null;
  return withComputedProgress(plan);
}

export async function createPlanForUser(
  userId: string,
  input: { title: string; isCustom?: boolean; bannerImage?: string | null }
): Promise<Record<string, unknown>> {
  const title = (input.title || '').trim();
  if (!title) throw new Error('Plan title is required');
  const plan = await Plan.create({
    userId,
    title,
    isCustom: input.isCustom ?? true,
    bannerImage: input.bannerImage ?? null,
    targets: [],
    tasks: [],
    progress: 0,
  });
  return withComputedProgress(plan);
}

export async function updatePlanForUser(
  userId: string,
  planId: string,
  patch: {
    title?: string;
    bannerImage?: string | null;
    targets?: PlanObjective[];
    tasks?: PlanObjective[];
  }
): Promise<Record<string, unknown> | null> {
  const plan = await Plan.findOne({ where: { id: planId, userId } });
  if (!plan) return null;

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error('Plan title cannot be empty');
    plan.title = title;
  }
  if (patch.bannerImage !== undefined) plan.bannerImage = patch.bannerImage;
  if (patch.targets !== undefined) plan.targets = patch.targets;
  if (patch.tasks !== undefined) plan.tasks = patch.tasks;

  const targets = (plan.targets || []).map(normalizeObjective);
  const tasks = (plan.tasks || []).map(normalizeObjective);
  plan.progress = calculatePlanProgress(targets, tasks);
  await plan.save();
  return withComputedProgress(plan);
}

export async function deletePlanForUser(userId: string, planId: string): Promise<boolean> {
  const deleted = await Plan.destroy({ where: { id: planId, userId } });
  return deleted > 0;
}

export function newObjectiveId(): string {
  return randomUUID();
}
