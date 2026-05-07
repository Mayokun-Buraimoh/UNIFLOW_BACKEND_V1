import { Request, Response } from 'express';
import { User } from '../models/User';
import { Profile } from '../models/profile';

// Get user profile
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['passwordHash'] },
      include: [{
        model: Profile,
        as: 'profile',
      }],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
};

// Update user profile
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated via this endpoint
    delete updateData.passwordHash;
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user
    await user.update(updateData);

    // Get updated user with profile
    const updatedUser = await User.findByPk(userId, {
      attributes: { exclude: ['passwordHash'] },
      include: [{
        model: Profile,
        as: 'profile',
      }],
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
};

// Delete user account
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user (this will cascade to related records due to foreign key constraints)
    await user.destroy();

    res.json({ message: 'User account deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user account' });
  }
};

// Get all users (admin only - placeholder)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    // This would typically require admin authentication
    const users = await User.findAll({
      attributes: { exclude: ['passwordHash'] },
      include: [{
        model: Profile,
        as: 'profile',
      }],
    });

    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};
