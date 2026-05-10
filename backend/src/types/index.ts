// Type definitions for Sequelize models

export interface IUser {
  id: string
  email: string
  passwordHash?: string
  googleId?: string
  appleId?: string
  name?: string
  avatar?: string
  preferences?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface IUserCreationAttributes {
  email: string
  passwordHash?: string
  googleId?: string
  appleId?: string
  name?: string
  avatar?: string
  preferences?: Record<string, unknown>
}

export interface IProfile {
  id: string
  userId: string
  email: string
  name?: string
  profilePicture?: string
  themeColor?: string
  darkMode?: boolean
  school?: string
  department?: string
  level?: string
  academicYear?: string
  subjects?: string[]
  bio?: string
  notificationSettings?: Record<string, unknown>
  studyGoals?: string[]
  preferences?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface IProfileCreationAttributes {
  userId: string
  email: string
  name?: string
  profilePicture?: string
  themeColor?: string
  darkMode?: boolean
  school?: string
  department?: string
  level?: string
  academicYear?: string
  subjects?: string[]
  bio?: string
  notificationSettings?: Record<string, unknown>
  studyGoals?: string[]
  preferences?: Record<string, unknown>
}

export interface ITask {
  id: string
  userId: string
  title: string
  description?: string
  priority: 'low' | 'medium' | 'critical'
  status: 'pending' | 'in_progress' | 'completed'
  dueDate?: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface ITaskCreationAttributes {
  userId: string
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'critical'
  status?: 'pending' | 'in_progress' | 'completed'
  dueDate?: Date
}

export interface ITaskUpdateAttributes {
  title?: string
  description?: string
  priority?: 'low' | 'medium' | 'critical'
  status?: 'pending' | 'in_progress' | 'completed'
  dueDate?: Date
  completedAt?: Date | null
}

export interface IWeeklySchedule {
  id: string
  userId: string
  data: Record<string, string[]>
  createdAt: Date
  updatedAt: Date
}

export interface IWeeklyScheduleCreationAttributes {
  userId: string
  data: Record<string, string[]>
}

export interface IEvent {
  id: string
  userId: string
  title: string
  time: string
  date: string
  priority: 'low' | 'medium' | 'critical'
  createdAt: Date
  updatedAt: Date
}

export interface IEventCreationAttributes {
  userId: string
  title: string
  time: string
  date: string
  priority?: 'low' | 'medium' | 'critical'
}

export interface IEventUpdateAttributes {
  title?: string
  time?: string
  date?: string
  priority?: 'low' | 'medium' | 'critical'
}

// Auth related types
export interface AuthResponse {
  success: boolean
  message: string
  token?: string
  user?: IUser
}

export interface LoginData {
  email: string
  password: string
}

export interface RegisterData {
  name: string
  email: string
  password: string
}
