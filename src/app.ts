import express, { type Express } from 'express';
import cors from 'cors';
import passport from './config/passport.js';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import { errorHandler } from './middleware/errorHandler.js';

/**
 * Create and configure Express app
 * Separated from index.ts for testing purposes
 */
export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize Passport (without sessions - we use JWT)
  app.use(passport.initialize());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Routes
  app.use('/auth', authRoutes);
  app.use('/oauth', oauthRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

export default createApp();
