import { Request, Response, NextFunction } from 'express';
import tokenService from '../services/tokenService.js';
import { AuthErrors } from '../types/errors.js';
import type { AccessTokenPayload } from '../types/auth.js';

/**
 * Extend Express Request to include authenticated user
 */
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * JWT authentication middleware
 * Extracts and verifies Bearer token from Authorization header
 * Attaches decoded user payload to req.user
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next(AuthErrors.unauthorized('No token provided'));
    }

    // Check for Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next(AuthErrors.unauthorized('Invalid token format. Use: Bearer <token>'));
    }

    const token = parts[1];

    // Verify and decode token
    const decoded = tokenService.verifyAccessToken(token);

    // Attach user to request
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Invalid token') {
        return next(AuthErrors.unauthorized('Invalid token'));
      }
      if (error.message === 'Token expired') {
        return next(AuthErrors.unauthorized('Token expired'));
      }
    }
    next(error);
  }
}
