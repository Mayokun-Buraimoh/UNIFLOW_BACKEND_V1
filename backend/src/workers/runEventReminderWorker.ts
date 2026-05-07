import 'dotenv/config';
import { Worker } from 'bullmq';
import '../models';
import { sequelize } from '../config/database';
import { createRedisDuplicateForWorker } from '../config/redisConnection';
import { EVENT_REMINDER_QUEUE_NAME } from '../queues/eventReminderQueue';
import { processEventReminderJob } from '../services/eventReminderJobProcessor';

async function main() {
  const connection = createRedisDuplicateForWorker();
  if (!connection) {
    console.error('Event reminder worker: Redis disabled (DISABLE_EVENT_REMINDERS=true).');
    process.exit(1);
  }

  await sequelize.authenticate();
  console.log('Event reminder worker: DB OK');

  const worker = new Worker(EVENT_REMINDER_QUEUE_NAME, processEventReminderJob, {
    connection,
    concurrency: Number(process.env.EVENT_REMINDER_WORKER_CONCURRENCY || 5),
  });

  worker.on('completed', (job) => {
    console.log(`[event-reminders] completed ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[event-reminders] failed ${job?.id}`, err);
  });

  const shutdown = async () => {
    console.log('Event reminder worker: shutting down...');
    await worker.close();
    await connection.quit().catch(() => undefined);
    await sequelize.close().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Event reminder worker listening on queue "${EVENT_REMINDER_QUEUE_NAME}"`);
}

main().catch((err) => {
  console.error('Event reminder worker failed to start:', err);
  process.exit(1);
});
