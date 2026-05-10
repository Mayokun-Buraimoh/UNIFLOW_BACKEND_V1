import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { sequelize } from './config/database';
import taskRoutes from './routes/task';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import profileRoutes from './routes/profile';
import scheduleRoutes from './routes/schedule';
import courseRoutes from './routes/course';
import eventRoutes from './routes/event';
import pushTokenRoutes from './routes/pushToken';
import internalRoutes from './routes/internal';
import './models'; // Import models to establish associations

const app = express();
const PORT = process.env.PORT || 3000;

// So req.protocol / host respect X-Forwarded-* on Render and similar proxies
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/push-tokens', pushTokenRoutes);
app.use('/api/internal', internalRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'UniFlow Backend is running' });
});

// 404 handler (must come before error handler)
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be last)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error caught by middleware:', err);
  console.error('Stack:', err.stack);
  res.status(err.status || 500).json({ 
    error: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Global error handlers to prevent unexpected exits
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - log the error and continue running
  // This prevents the server from stopping due to unhandled promise rejections
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  // For uncaught exceptions, we might want to exit gracefully
  // But let's log first and see if we can recover
  console.error('Stack:', error.stack);
});

// Database connection and server start
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Sync database (create tables if they don't exist)
    await sequelize.sync({ alter: true });
    console.log('Database synchronized successfully.');
    
    app.listen(PORT, () => {
      console.log(`UniFlow Backend server is running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    // Only exit if we can't start the server
    // For runtime errors, we want to keep the server running
    process.exit(1);
  }
}

// Handle promise rejections from startServer
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
