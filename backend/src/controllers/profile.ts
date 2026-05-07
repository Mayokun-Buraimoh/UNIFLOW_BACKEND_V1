import { Request, Response } from 'express';
import { Profile } from '../models/profile';
import { User } from '../models/User';

// Get user profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware

    const profile = await Profile.findOne({
      where: { userId },
      include: [{
        model: User,
        as: 'user',
        attributes: { exclude: ['passwordHash'] },
      }],
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// Update user profile
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const updateData = req.body;

    // Remove fields that shouldn't be updated via this endpoint
    delete updateData.id;
    delete updateData.userId;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    let profile = await Profile.findOne({ where: { userId } });

    if (!profile) {
      // Create profile if it doesn't exist
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      profile = await Profile.create({
        userId,
        email: user.email,
        name: user.name,
        ...updateData,
      });
    } else {
      // Update existing profile
      await profile.update(updateData);
    }

    // Get updated profile with user data
    const updatedProfile = await Profile.findOne({
      where: { userId },
      include: [{
        model: User,
        as: 'user',
        attributes: { exclude: ['passwordHash'] },
      }],
    });

    res.json(updatedProfile);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Update notification settings
export const updateNotificationSettings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const { notificationSettings } = req.body;

    if (!notificationSettings) {
      return res.status(400).json({ error: 'Notification settings are required' });
    }

    let profile = await Profile.findOne({ where: { userId } });

    if (!profile) {
      // Create profile if it doesn't exist
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      profile = await Profile.create({
        userId,
        email: user.email,
        name: user.name,
        notificationSettings,
      });
    } else {
      // Update notification settings
      await profile.update({ notificationSettings });
    }

    res.json({ message: 'Notification settings updated successfully' });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
};

// Update study goals
export const updateStudyGoals = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const { studyGoals } = req.body;

    if (!studyGoals) {
      return res.status(400).json({ error: 'Study goals are required' });
    }

    let profile = await Profile.findOne({ where: { userId } });

    if (!profile) {
      // Create profile if it doesn't exist
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      profile = await Profile.create({
        userId,
        email: user.email,
        name: user.name,
        studyGoals,
      });
    } else {
      // Update study goals
      await profile.update({ studyGoals });
    }

    res.json({ message: 'Study goals updated successfully' });
  } catch (error) {
    console.error('Update study goals error:', error);
    res.status(500).json({ error: 'Failed to update study goals' });
  }
};

// Update preferences
export const updatePreferences = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const { preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({ error: 'Preferences are required' });
    }

    let profile = await Profile.findOne({ where: { userId } });

    if (!profile) {
      // Create profile if it doesn't exist
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      profile = await Profile.create({
        userId,
        email: user.email,
        name: user.name,
        preferences,
      });
    } else {
      // Update preferences
      await profile.update({ preferences });
    }

    res.json({ message: 'Preferences updated successfully' });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};
