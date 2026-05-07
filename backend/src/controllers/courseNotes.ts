import { Request, Response } from 'express';
import { Course } from '../models/Course';
import CourseNote from '../models/CourseNote';

// GET /api/courses/:id/notes
export const getCourseNotes = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;

    // Verify course belongs to user
    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const notes = await CourseNote.findAll({ where: { courseId, userId }, order: [['createdAt', 'DESC']] });
    res.json({ notes });
  } catch (error) {
    console.error('Get course notes error:', error);
    res.status(500).json({ error: 'Failed to fetch course notes' });
  }
};

// POST /api/courses/:id/notes
export const createCourseNote = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    const { title, content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // Verify course belongs to user
    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const note = await CourseNote.create({ courseId, userId, title: title || null, content });

    res.status(201).json(note);
  } catch (error) {
    console.error('Create course note error:', error);
    res.status(500).json({ error: 'Failed to create course note' });
  }
};

// PATCH /api/courses/:id/notes/:noteId
export const updateCourseNote = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    const noteId = req.params.noteId;
    const { title, content } = req.body;

    // Verify course belongs to user
    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const note = await CourseNote.findOne({ where: { id: noteId, courseId, userId } });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;

    await note.save();

    res.json(note);
  } catch (error) {
    console.error('Update course note error:', error);
    res.status(500).json({ error: 'Failed to update course note' });
  }
};

// DELETE /api/courses/:id/notes/:noteId
export const deleteCourseNote = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const courseId = req.params.id;
    const noteId = req.params.noteId;

    // Verify course belongs to user
    const course = await Course.findOne({ where: { id: courseId, userId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const deletedCount = await CourseNote.destroy({ where: { id: noteId, courseId, userId } });
    if (deletedCount === 0) return res.status(404).json({ error: 'Note not found' });

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete course note error:', error);
    res.status(500).json({ error: 'Failed to delete course note' });
  }
};

export default {
  getCourseNotes,
  createCourseNote,
  updateCourseNote,
  deleteCourseNote,
};
