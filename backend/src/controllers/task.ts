import { Request, Response } from 'express';
import { Task } from '../models/Task';

// Get all tasks for user
export const getUserTasks = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const { status, priority, limit = 50, offset = 0 } = req.query;
    
    console.log(`Getting tasks for user ${userId}`);

    const whereClause: any = { userId };
    
    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;

    const tasks = await Task.findAll({
      where: whereClause,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      order: [['createdAt', 'DESC']],
    });

    const total = await Task.count({ where: whereClause });

    res.json({
      tasks,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + tasks.length
      }
    });
  } catch (error) {
    console.error('Get user tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

// Get single task
export const getTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const taskId = req.params.id;

    const task = await Task.findOne({ where: { id: taskId, userId } });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
};

// Create task
export const createTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const data = req.body;
    
    console.log(`Creating task for user ${userId}: ${data.title}`);

    // Validation
    if (!data.title || data.title.trim().length === 0) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    if (data.title.length > 100) {
      return res.status(400).json({ error: 'Task title must be 100 characters or less' });
    }

    if (data.priority && !['low', 'medium', 'critical'].includes(data.priority)) {
      return res.status(400).json({ error: 'Invalid priority level' });
    }

    if (data.status && !['pending', 'in_progress', 'completed'].includes(data.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const task = await Task.create({
      ...data,
      userId,
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

// Update task
export const updateTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const taskId = req.params.id;
    const data = req.body;

    // Validation
    if (data.title && data.title.trim().length === 0) {
      return res.status(400).json({ error: 'Task title cannot be empty' });
    }

    if (data.title && data.title.length > 100) {
      return res.status(400).json({ error: 'Task title must be 100 characters or less' });
    }

    if (data.priority && !['low', 'medium', 'critical'].includes(data.priority)) {
      return res.status(400).json({ error: 'Invalid priority level' });
    }

    if (data.status && !['pending', 'in_progress', 'completed'].includes(data.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Auto-set completedAt when status changes to completed
    if (data.status === 'completed' && !data.completedAt) {
      data.completedAt = new Date();
    } else if (data.status !== 'completed') {
      data.completedAt = undefined;
    }

    const [updatedCount] = await Task.update(data, {
      where: { id: taskId, userId }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = await Task.findOne({
      where: { id: taskId, userId }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

// Delete task
export const deleteTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const taskId = req.params.id;

    const deletedCount = await Task.destroy({
      where: { id: taskId, userId }
    });

    if (deletedCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

// Toggle task status
export const toggleTaskStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const taskId = req.params.id;

    const task = await Task.findOne({ where: { id: taskId, userId } });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const completedAt = newStatus === 'completed' ? new Date() : undefined;

    await Task.update(
      { status: newStatus, completedAt },
      { where: { id: taskId, userId } }
    );

    const updatedTask = await Task.findOne({
      where: { id: taskId, userId }
    });

    res.json(updatedTask);
  } catch (error) {
    console.error('Toggle task status error:', error);
    res.status(500).json({ error: 'Failed to toggle task status' });
  }
};

// Get task statistics
export const getTaskStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware

    const [totalTasks, completedTasks, pendingTasks, criticalTasks] = await Promise.all([
      Task.count({ where: { userId } }),
      Task.count({ where: { userId, status: 'completed' } }),
      Task.count({ where: { userId, status: 'pending' } }),
      Task.count({ where: { userId, priority: 'critical' } })
    ]);

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    res.json({
      total: totalTasks,
      completed: completedTasks,
      pending: pendingTasks,
      critical: criticalTasks,
      completionRate: Math.round(completionRate * 100) / 100
    });
  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ error: 'Failed to get task statistics' });
  }
};