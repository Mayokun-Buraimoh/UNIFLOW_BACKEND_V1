import { Queue } from 'bullmq';
import { getRedisConnection } from '../config/redisConnection';

export const EVENT_REMINDER_QUEUE_NAME = 'event-reminders';

export const EVENT_REMINDER_JOB_NAME = 'send-event-reminder';

export interface EventReminderJobData {
  eventId: string;
  userId: string;
  title: string;
  /** When the event starts (for debugging / optional staleness checks) */
  eventStartsAtIso: string;
}

let queue: Queue<EventReminderJobData> | null = null;

export function getEventReminderQueue(): Queue<EventReminderJobData> | null {
  const connection = getRedisConnection();
  if (!connection) {
    return null;
  }
  if (!queue) {
    queue = new Queue<EventReminderJobData>(EVENT_REMINDER_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return queue;
}

export function eventReminderJobId(eventId: string): string {
  return `event-reminder:${eventId}`;
}
