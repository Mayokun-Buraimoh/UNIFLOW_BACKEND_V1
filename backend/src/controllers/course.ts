import { Request, Response } from 'express';
import { Course } from '../models/Course';
import { MoodleConnection } from '../models/MoodleConnection';
import { MoodleService } from '../services/moodleService';

// Get all courses for user
export const getUserCourses = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    
    const courses = await Course.findAll({
      where: { userId, visible: true },
      order: [['code', 'ASC']],
    });

    res.json({ courses });
  } catch (error) {
    console.error('Get user courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
};

// Get single course
export const getCourse = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;

    const course = await Course.findOne({ where: { id: courseId, userId } });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
};

// Create or update Moodle connection
export const createOrUpdateMoodleConnection = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { moodleUrl, webServiceToken } = req.body;

    if (!moodleUrl) {
      return res.status(400).json({ error: 'Moodle URL is required' });
    }

    // Validate URL format
    try {
      new URL(moodleUrl.startsWith('http') ? moodleUrl : `https://${moodleUrl}`);
    } catch {
      return res.status(400).json({ error: 'Invalid Moodle URL format' });
    }

    // Normalize URL
    let normalizedUrl = moodleUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/$/, '');

    // Find or create connection
    const [connection, created] = await MoodleConnection.findOrCreate({
      where: { userId },
      defaults: {
        userId,
        moodleUrl: normalizedUrl,
        webServiceToken: webServiceToken || undefined,
        isActive: true,
      },
    });

    if (!created) {
      // Update existing connection
      connection.moodleUrl = normalizedUrl;
      if (webServiceToken !== undefined) {
        connection.webServiceToken = webServiceToken || undefined;
      }
      connection.isActive = true;
      await connection.save();
    }

    // If token is provided, test the connection and sync courses
    if (connection.webServiceToken) {
      try {
        await syncCoursesFromMoodle(userId);
        connection.lastSyncedAt = new Date();
        await connection.save();
      } catch (syncError: any) {
        console.error('Initial sync error:', syncError);
        // Don't fail the connection creation if sync fails
        // The user can manually sync later or fix their token
        // Return a warning but still save the connection
      }
    } else {
      // No token - connection is saved but courses won't sync automatically
      // User can still use "Open in Browser" functionality
    }

    res.json({
      message: 'Moodle connection saved successfully',
      connection: {
        id: connection.id,
        moodleUrl: connection.moodleUrl,
        hasToken: !!connection.webServiceToken,
        lastSyncedAt: connection.lastSyncedAt,
      },
    });
  } catch (error: any) {
    console.error('Create/update Moodle connection error:', error);
    res.status(500).json({ error: error.message || 'Failed to save Moodle connection' });
  }
};

// Get Moodle connection status
export const getMoodleConnection = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const connection = await MoodleConnection.findOne({ where: { userId } });

    if (!connection) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      moodleUrl: connection.moodleUrl,
      hasToken: !!connection.webServiceToken,
      isActive: connection.isActive,
      lastSyncedAt: connection.lastSyncedAt,
    });
  } catch (error) {
    console.error('Get Moodle connection error:', error);
    res.status(500).json({ error: 'Failed to fetch Moodle connection' });
  }
};

// Sync courses from Moodle
export const syncCoursesFromMoodle = async (userId: string): Promise<void> => {
  const connection = await MoodleConnection.findOne({ 
    where: { userId, isActive: true } 
  });

  if (!connection) {
    throw new Error('No active Moodle connection found');
  }

  if (!connection.webServiceToken) {
    throw new Error('Web service token is required to sync courses');
  }

  // Fetch courses from Moodle
  const moodleCourses = await MoodleService.fetchCourses(
    connection.moodleUrl,
    connection.webServiceToken
  );

  // Transform and upsert courses
  for (const moodleCourse of moodleCourses) {
    const courseData = MoodleService.transformMoodleCourse(moodleCourse, userId);
    
    await Course.upsert({
      ...courseData,
      userId,
      moodleCourseId: moodleCourse.id,
    } as any, {
      conflictFields: ['userId', 'moodleCourseId'],
    });
  }

  // Update last synced timestamp
  connection.lastSyncedAt = new Date();
  await connection.save();
};

// Sync courses endpoint
export const syncCourses = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    await syncCoursesFromMoodle(userId);

    // Get updated courses
    const courses = await Course.findAll({
      where: { userId, visible: true },
      order: [['code', 'ASC']],
    });

    res.json({
      message: 'Courses synced successfully',
      courses,
      syncedAt: new Date(),
    });
  } catch (error: any) {
    console.error('Sync courses error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to sync courses from Moodle' 
    });
  }
};

// Create course manually (for users without web service token)
export const createCourse = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { code, name, color, week } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Course code and name are required' });
    }

    // Generate color if not provided
    const colors = [
      '#4A90E2', '#50C878', '#FF6B6B', '#FFA07A', '#20B2AA',
      '#9370DB', '#FFD700', '#FF69B4', '#00CED1', '#FF6347'
    ];
    const colorIndex = code.charCodeAt(0) % colors.length;
    const courseColor = color || colors[colorIndex];

    const course = await Course.create({
      userId,
      code: code.trim(),
      name: name.trim(),
      color: courseColor,
      iconColor: '#FFFFFF',
      fileIcon: '/assets/icons/course-icon.svg',
      week: week || 1,
      visible: true,
    });

    res.status(201).json(course);
  } catch (error: any) {
    console.error('Create course error:', error);
    res.status(500).json({ error: error.message || 'Failed to create course' });
  }
};

// Update course (e.g., lastOpened, color, etc.)
export const updateCourse = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    const updates = req.body;

    const course = await Course.findOne({ where: { id: courseId, userId } });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Allow updating specific fields
    const allowedFields = ['color', 'iconColor', 'fileIcon', 'week', 'lastOpened'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        (course as any)[field] = updates[field];
      }
    }

    await course.save();

    res.json(course);
  } catch (error: any) {
    console.error('Update course error:', error);
    res.status(500).json({ error: error.message || 'Failed to update course' });
  }
};

// Delete course
export const deleteCourse = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;

    const course = await Course.findOne({ where: { id: courseId, userId } });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Remove associated files from disk before deleting the course record.
    try {
      const CourseFile = require('../models/CourseFile').default;
      const path = require('path');
      const fs = require('fs');

      const files = await CourseFile.findAll({ where: { courseId, userId } });
      for (const f of files) {
        try {
          const absolute = path.resolve(process.cwd(), f.storagePath);
          if (fs.existsSync(absolute)) {
            fs.unlinkSync(absolute);
          }
        } catch (diskErr) {
          console.warn('Failed to remove file from disk during course deletion', diskErr);
        }
      }
    } catch (cleanupErr) {
      console.warn('Error while cleaning up course files from disk:', cleanupErr);
      // continue to delete the course record even if cleanup fails
    }

    await course.destroy();

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
};
