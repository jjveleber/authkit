import { Request, Response, NextFunction } from 'express';
import { AuthError } from '../types/errors.js';
import env from '../config/env.js';

/**
 * Global error handler middleware
 * Catches all errors and returns appropriate JSON responses
 * Must be registered after all routes
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle known authentication errors
  if (err instanceof AuthError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);

  // Don't expose stack traces in production
  const isDevelopment = env.NODE_ENV === 'development';

  res.status(500).json({
    error: 'Internal server error',
    ...(isDevelopment && { details: err.message, stack: err.stack }),
  });
}
