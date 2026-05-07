import { Event } from '../models/Event';
import {
  EVENT_REMINDER_JOB_NAME,
  EventReminderJobData,
  eventReminderJobId,
  getEventReminderQueue,
} from '../queues/eventReminderQueue';
import { EVENT_REMINDER_LEAD_MS, getEventStartDate } from '../utils/eventDateTime';

export async function cancelEventReminderJob(eventId: string): Promise<void> {
  const queue = getEventReminderQueue();
  if (!queue) return;
  const job = await queue.getJob(eventReminderJobId(eventId));
  if (job) {
    await job.remove().catch(() => undefined);
  }
}

/**
 * Ensures a single delayed job per event: fires ~10 minutes before start.
 * No-op if Redis is disabled, datetime is invalid, or reminder time is already past.
 */
export async function scheduleEventReminderForEvent(event: Event): Promise<void> {
  try {
    await cancelEventReminderJob(event.id);
    const queue = getEventReminderQueue();
    if (!queue) {
      return;
    }

    const start = getEventStartDate(event.date, event.time);
    if (!start) {
      return;
    }

    const reminderAt = start.getTime() - EVENT_REMINDER_LEAD_MS;
    const delay = reminderAt - Date.now();
    if (delay < 0) {
      return;
    }

    const payload: EventReminderJobData = {
      eventId: event.id,
      userId: event.userId,
      title: event.title,
      eventStartsAtIso: start.toISOString(),
    };

    await queue.add(EVENT_REMINDER_JOB_NAME, payload, {
      jobId: eventReminderJobId(event.id),
      delay,
    });
  } catch (err) {
    console.error('[event-reminders] schedule failed:', err);
  }
}

export async function rescheduleEventReminderForEvent(event: Event): Promise<void> {
  await scheduleEventReminderForEvent(event);
}
