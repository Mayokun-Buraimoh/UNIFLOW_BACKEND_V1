import 'dotenv/config';
import { sequelize } from '../src/config/database';

async function main() {
  await sequelize.authenticate();

  const tables = [
    'users',
    'profiles',
    'tasks',
    'events',
    'weekly_schedules',
    'courses',
    'moodle_connections',
    'course_notes',
    'course_files',
    'device_push_tokens',
  ];

  console.log('\n=== Row counts ===');
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const [rows]: any = await sequelize.query(`SELECT COUNT(*)::int AS c FROM "${t}"`);
      counts[t] = rows[0].c;
    } catch (e: any) {
      counts[t] = -1;
    }
  }
  console.table(counts);

  console.log('\n=== Latest course_notes (up to 20) ===');
  const [notes]: any = await sequelize.query(
    `SELECT id, "courseId", "userId", LEFT(COALESCE(title,''), 30) AS title,
            LEFT(content, 60) AS content_preview, LENGTH(content) AS len,
            "createdAt" FROM "course_notes" ORDER BY "createdAt" DESC LIMIT 20`
  );
  console.table(notes);

  console.log('\n=== Latest course_files (up to 20) ===');
  const [files]: any = await sequelize.query(
    `SELECT id, "courseId", "userId", "originalName", "mimeType", size,
            "storagePath", ("cloudinaryUrl" IS NOT NULL) AS on_cloudinary,
            "createdAt" FROM "course_files" ORDER BY "createdAt" DESC LIMIT 20`
  );
  console.table(files);

  console.log('\n=== Latest events (up to 20) ===');
  const [events]: any = await sequelize.query(
    `SELECT id, "userId", title, date, time, priority, "createdAt"
       FROM "events" ORDER BY "createdAt" DESC LIMIT 20`
  );
  console.table(events);

  console.log('\n=== Latest tasks (up to 20) ===');
  const [tasks]: any = await sequelize.query(
    `SELECT id, "userId", LEFT(title, 40) AS title, status, priority, "dueDate", "createdAt"
       FROM "tasks" ORDER BY "createdAt" DESC LIMIT 20`
  );
  console.table(tasks);

  console.log('\n=== Per-user activity for victormartins2035 ===');
  const [me]: any = await sequelize.query(
    `SELECT id FROM "users" WHERE email = 'victormartins2035@gmail.com'`
  );
  if (me.length) {
    const uid = me[0].id;
    const [mineTasks]: any = await sequelize.query(
      `SELECT COUNT(*)::int AS tasks FROM "tasks" WHERE "userId" = $1`,
      { bind: [uid] }
    );
    const [mineCourses]: any = await sequelize.query(
      `SELECT COUNT(*)::int AS courses FROM "courses" WHERE "userId" = $1`,
      { bind: [uid] }
    );
    const [mineNotes]: any = await sequelize.query(
      `SELECT COUNT(*)::int AS notes FROM "course_notes" WHERE "userId" = $1`,
      { bind: [uid] }
    );
    const [mineFiles]: any = await sequelize.query(
      `SELECT COUNT(*)::int AS files FROM "course_files" WHERE "userId" = $1`,
      { bind: [uid] }
    );
    const [mineEvents]: any = await sequelize.query(
      `SELECT COUNT(*)::int AS events FROM "events" WHERE "userId" = $1`,
      { bind: [uid] }
    );
    console.table({
      userId: uid,
      tasks: mineTasks[0].tasks,
      courses: mineCourses[0].courses,
      notes: mineNotes[0].notes,
      files: mineFiles[0].files,
      events: mineEvents[0].events,
    });
  } else {
    console.log('user not found');
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error('inspect-db failed:', e);
  process.exit(1);
});
