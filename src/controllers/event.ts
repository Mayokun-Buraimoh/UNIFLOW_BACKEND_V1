import { Request, Response } from 'express';
import { Event } from '../models/Event';
import {
  cancelEventReminderJob,
  scheduleEventReminderForEvent,
} from '../services/eventReminderScheduler';

// Get all events for user
export const getUserEvents = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const { date } = req.query;
    
    const whereClause: any = { userId };
    
    if (date) {
      whereClause.date = date;
    }

    const events = await Event.findAll({
      where: whereClause,
      order: [['date', 'ASC'], ['time', 'ASC']],
    });

    res.json({ events });
  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
};

// Get single event
export const getEvent = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const eventId = req.params.id;

    const event = await Event.findOne({ where: { id: eventId, userId } });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
};

// Create event
export const createEvent = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { title, time, date, priority = 'low' } = req.body;

    if (!title || !time || !date) {
      return res.status(400).json({ error: 'Title, time, and date are required' });
    }

    const event = await Event.create({
      userId,
      title: title.trim(),
      time: time.trim(),
      date: date.trim(),
      priority,
    });

    void scheduleEventReminderForEvent(event);

    res.status(201).json(event);
  } catch (error: any) {
    console.error('Create event error:', error);
    res.status(500).json({ error: error.message || 'Failed to create event' });
  }
};

// Update event
export const updateEvent = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const eventId = req.params.id;
    const { title, time, date, priority } = req.body;

    const event = await Event.findOne({ where: { id: eventId, userId } });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Update allowed fields
    if (title !== undefined) event.title = title.trim();
    if (time !== undefined) event.time = time.trim();
    if (date !== undefined) event.date = date.trim();
    if (priority !== undefined) event.priority = priority;

    await event.save();

    void scheduleEventReminderForEvent(event);

    res.json(event);
  } catch (error: any) {
    console.error('Update event error:', error);
    res.status(500).json({ error: error.message || 'Failed to update event' });
  }
};

// Delete event
export const deleteEvent = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const eventId = req.params.id;

    const event = await Event.findOne({ where: { id: eventId, userId } });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await cancelEventReminderJob(eventId);
    await event.destroy();

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
};
