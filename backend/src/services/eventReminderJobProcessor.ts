import { Job } from 'bullmq';
import { Event } from '../models/Event';
import { EventReminderJobData } from '../queues/eventReminderQueue';
import { getEventStartDate } from '../utils/eventDateTime';
import { sendEventReminderPush } from './fcmEventReminder';

const STALE_AFTER_MS = 2 * 60 * 1000;

export async function processEventReminderJob(job: Job<EventReminderJobData>): Promise<void> {
  const { eventId, userId } = job.data;

  const event = await Event.findOne({ where: { id: eventId, userId } });
  if (!event) {
    return;
  }

  const start = getEventStartDate(event.date, event.time);
  if (!start) {
    return;
  }

  const now = Date.now();
  if (now > start.getTime() + STALE_AFTER_MS) {
    return;
  }

  await sendEventReminderPush({
    userId: event.userId,
    eventId: event.id,
    title: event.title,
  });
}
