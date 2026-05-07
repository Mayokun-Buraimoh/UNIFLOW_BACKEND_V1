import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { sequelize } from '../src/config/database';
import { Course } from '../src/models';
import CourseNote from '../src/models/CourseNote';
import CourseFile from '../src/models/CourseFile';

async function main() {
  console.log('Connecting to DB...');
  await sequelize.authenticate();

  console.log('Fetching course file records to delete files from disk...');
  const files = await CourseFile.findAll();

  let deletedFiles = 0;
  for (const f of files) {
    try {
      const absolute = path.resolve(process.cwd(), f.storagePath);
      if (fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
        deletedFiles++;
        console.log(`Deleted file on disk: ${absolute}`);
      } else {
        console.log(`File not found on disk (skipped): ${absolute}`);
      }
    } catch (err) {
      console.warn('Failed deleting file', f.storagePath, err);
    }
  }

  // Attempt to remove uploads/courses directory if exists
  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'courses');
  try {
    if (fs.existsSync(uploadsDir)) {
      // remove recursively
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      console.log(`Removed directory: ${uploadsDir}`);
    } else {
      console.log(`Uploads directory not found: ${uploadsDir}`);
    }
  } catch (err) {
    console.warn('Failed to remove uploads directory:', err);
  }

  console.log('Deleting CourseFile rows...');
  const filesDeleted = await CourseFile.destroy({ where: {} });
  console.log(`CourseFile rows deleted: ${filesDeleted}`);

  console.log('Deleting CourseNote rows...');
  const notesDeleted = await CourseNote.destroy({ where: {} });
  console.log(`CourseNote rows deleted: ${notesDeleted}`);

  console.log('Deleting Course rows...');
  const coursesDeleted = await Course.destroy({ where: {} });
  console.log(`Course rows deleted: ${coursesDeleted}`);

  await sequelize.close();
  console.log(`Done. Deleted ${deletedFiles} files from disk. DB connection closed.`);
}

main().catch(err => {
  console.error('Delete-all-courses script failed:', err);
  process.exit(1);
});
