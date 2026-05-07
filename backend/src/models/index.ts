// Import all models to ensure they're loaded and associations are established
import { User } from './User'
import { Profile } from './profile'
import { Task } from './Task'
import { WeeklySchedule } from './WeeklySchedule'
import { Course } from './Course'
import { MoodleConnection } from './MoodleConnection'
import { Event } from './Event'
import { DevicePushToken } from './DevicePushToken'
import CourseNote from './CourseNote'
import CourseFile from './CourseFile'

// Define associations
User.hasOne(Profile, { foreignKey: 'userId', as: 'profile' });
Profile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Task, { foreignKey: 'userId', as: 'tasks' });
Task.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(WeeklySchedule, { foreignKey: 'userId', as: 'weeklySchedule', onDelete: 'CASCADE', hooks: true });
WeeklySchedule.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Course, { foreignKey: 'userId', as: 'courses' });
Course.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Course notes associations
User.hasMany(CourseNote, { foreignKey: 'userId', as: 'courseNotes' });
CourseNote.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Course.hasMany(CourseNote, { foreignKey: 'courseId', as: 'notes' });
CourseNote.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

Course.hasMany(CourseFile, { foreignKey: 'courseId', as: 'files' });
CourseFile.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

User.hasMany(CourseFile, { foreignKey: 'userId', as: 'courseFiles' });
CourseFile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(MoodleConnection, { foreignKey: 'userId', as: 'moodleConnection' });
MoodleConnection.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Event, { foreignKey: 'userId', as: 'events' });
Event.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(DevicePushToken, { foreignKey: 'userId', as: 'devicePushTokens' });
DevicePushToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Export all models
export { User, Profile, Task, WeeklySchedule, Course, MoodleConnection, Event, DevicePushToken }
