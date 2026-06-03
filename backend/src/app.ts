import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
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
import planRoutes from './routes/plan';
import voiceRoutes from './routes/voice';
import { setupVoiceRealtimeServer } from './realtime/voiceRealtimeServer';
import './models'; // Import models to establish associations

const app = express();
const PORT = process.env.PORT || 3000;

// So req.protocol / host respect X-Forwarded-* on Render and similar proxies
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Lightweight request logger. Helps diagnose "saves not reaching the server" —
// every request prints method, URL, status, duration, and (when non-2xx) the
// origin/auth-presence so we can tell at a glance whether the client even hit
// this backend. Toggle with REQUEST_LOG=quiet to silence noisy 200s.
app.use((req, res, next) => {
  const start = Date.now();
  const quiet = process.env.REQUEST_LOG === 'quiet';
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (quiet && res.statusCode < 400 && req.method === 'GET') return;
    const origin = req.headers.origin || req.headers.referer || '-';
    const auth = req.headers.authorization ? 'auth' : 'noauth';
    // eslint-disable-next-line no-console
    console.log(
      `[req] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms ${auth} origin=${origin}`
    );
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/push-tokens', pushTokenRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/voice', voiceRoutes);

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

  // Postgres `22P02 invalid input syntax for type uuid` (or similar text->type
  // cast errors) happen when the client sends a local-first temp id like
  // `lf-temp-…` into a column typed UUID. Surface this as a clear 400 instead
  // of an opaque 500 so the client can re-sync and retry.
  const pgCode = err?.parent?.code || err?.original?.code || err?.code;
  if (pgCode === '22P02') {
    res.status(400).json({
      error:
        'Invalid id format. This item is still syncing from this device — reopen it from the list, wait for sync to finish, then try again.',
    });
    return;
  }

  // Sequelize validation / unique-constraint errors → 400 / 409
  if (err?.name === 'SequelizeValidationError') {
    res.status(400).json({
      error: 'Validation failed.',
      details: (err.errors || []).map((e: any) => ({ field: e.path, message: e.message })),
    });
    return;
  }
  if (err?.name === 'SequelizeUniqueConstraintError') {
    res.status(409).json({
      error: 'A record with these unique fields already exists.',
      details: (err.errors || []).map((e: any) => ({ field: e.path, message: e.message })),
    });
    return;
  }

  res.status(err.status || 500).json({
    error: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
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
    
    // Create missing tables only. Avoid `alter: true` by default — it can fail on shared DBs
    // (e.g. Sequelize tries to drop FK constraints that were renamed or never existed).
    // To force schema-alter sync: SEQUELIZE_SYNC_ALTER=true npm run dev
    const syncAlter =
      process.env.SEQUELIZE_SYNC_ALTER === 'true' || process.env.SEQUELIZE_SYNC_ALTER === '1';
    await sequelize.sync({ alter: syncAlter });
    console.log(`Database synchronized successfully (alter=${syncAlter}).`);
    
    const httpServer = createServer(app);
    setupVoiceRealtimeServer(httpServer);
    httpServer.listen(PORT, () => {
      console.log(`UniFlow Backend server is running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Realtime voice WS: ws://localhost:${PORT}/api/voice/realtime`);
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
