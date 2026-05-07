import 'dotenv/config';
import { sequelize } from '../src/config/database';
import { Course, User } from '../src/models';
import CourseNote from '../src/models/CourseNote';
import CourseFile from '../src/models/CourseFile';

async function main() {
  console.log('Connecting to DB...');
  await sequelize.authenticate();
  console.log('DB connected. Fetching recent courses and notes...');

  const courses = await Course.findAll({ limit: 10, order: [['createdAt', 'DESC']] });
  const notes = await CourseNote.findAll({ limit: 10, order: [['createdAt', 'DESC']] });
  const files = await CourseFile.findAll({ limit: 10, order: [['createdAt', 'DESC']] });

  console.log(`Courses found: ${courses.length}`);
  courses.forEach(c => {
    // @ts-ignore
    console.log(`- Course id=${c.id} userId=${c.userId} name=${c.name} createdAt=${c.createdAt}`);
  });

  console.log(`\nCourse notes found: ${notes.length}`);
  notes.forEach(n => {
    // @ts-ignore
    console.log(`- Note id=${n.id} courseId=${n.courseId} userId=${n.userId} title=${n.title} createdAt=${n.createdAt}`);
  });

  console.log(`\nCourse files found: ${files.length}`);
  files.forEach(f => {
    // @ts-ignore
    console.log(`- File id=${f.id} courseId=${f.courseId} userId=${f.userId} originalName=${f.originalName} storagePath=${f.storagePath}`);
  });

  await sequelize.close();
  console.log('\nDone. DB connection closed.');
}

main().catch(err => {
  console.error('Inspect script failed:', err);
  process.exit(1);
});
