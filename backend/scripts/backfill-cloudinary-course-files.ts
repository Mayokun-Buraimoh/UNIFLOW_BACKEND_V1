import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import CourseFile from '../src/models/CourseFile';
import { sequelize } from '../src/config/database';
import { uploadCoursePdfToCloudinary } from '../src/utils/courseFileCloudinary';

type CliOptions = {
  dryRun: boolean;
  limit: number | null;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  return {
    dryRun,
    limit: Number.isFinite(limit) && (limit as number) > 0 ? (limit as number) : null,
  };
}

function absolutePathFromStoragePath(storagePath: string): string {
  // Script runs from backend root (`npm run ...`), where storagePath is typically `uploads/courses/...`.
  return path.resolve(process.cwd(), storagePath);
}

async function main() {
  const options = parseArgs();
  console.log('[backfill] dryRun=%s limit=%s', options.dryRun, options.limit ?? 'none');

  await sequelize.authenticate();

  const where: any = {
    cloudinaryUrl: null,
  };

  const files = await CourseFile.findAll({
    where,
    order: [['createdAt', 'DESC']],
    ...(options.limit ? { limit: options.limit } : {}),
  });

  console.log('[backfill] candidate rows without cloudinaryUrl: %d', files.length);

  let uploaded = 0;
  let skippedMissingFile = 0;
  let failed = 0;

  for (const file of files) {
    const localPath = absolutePathFromStoragePath(file.storagePath);
    const label = `${file.id} (${file.originalName})`;

    if (!fs.existsSync(localPath)) {
      skippedMissingFile += 1;
      console.warn('[backfill] skip missing file: %s -> %s', label, localPath);
      continue;
    }

    if (options.dryRun) {
      console.log('[backfill] dry-run would upload: %s -> %s', label, localPath);
      continue;
    }

    try {
      const up = await uploadCoursePdfToCloudinary({
        localPath,
        courseId: file.courseId,
        fileId: file.id,
      });

      await file.update({
        cloudinaryUrl: up.secureUrl,
        cloudinaryPublicId: up.publicId,
      });
      uploaded += 1;
      console.log('[backfill] uploaded: %s', label);
    } catch (err: any) {
      failed += 1;
      console.error(
        '[backfill] failed: %s -> message=%s http_code=%s',
        label,
        err?.message || String(err),
        err?.http_code || 'n/a'
      );
    }
  }

  console.log(
    '[backfill] done uploaded=%d skippedMissingFile=%d failed=%d',
    uploaded,
    skippedMissingFile,
    failed
  );

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('[backfill] fatal error:', err);
  try {
    await sequelize.close();
  } catch {
    // ignore
  }
  process.exit(1);
});

