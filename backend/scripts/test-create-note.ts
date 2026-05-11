import 'dotenv/config';
import { sequelize } from '../src/config/database';
import { User, Course } from '../src/models';
import CourseNote from '../src/models/CourseNote';

async function main() {
  console.log('Connecting to DB...');
  await sequelize.authenticate();
  console.log('DB connected. Ensuring schema... (this may alter tables)');
  await sequelize.sync({ alter: true });

  console.log('Creating test user...');
  const user = await User.create({ email: `test-${Date.now()}@local`, name: 'Test User' });

  console.log('Creating test course...');
  const course = await Course.create({ userId: user.id, code: `TST${Date.now() % 10000}`, name: 'Test Course' });

  console.log('Creating test course note...');
  const note = await CourseNote.create({ userId: user.id, courseId: course.id, title: 'Test Note', content: 'This is a test note created by automated script.' });

  console.log('Created entities:');
  console.log('User ID:', user.id);
  console.log('Course ID:', course.id);
  console.log('Note ID:', note.id);
  console.log('Note createdAt:', note.createdAt);

  await sequelize.close();
  console.log('Done. DB connection closed.');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
