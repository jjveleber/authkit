import { Request, Response, NextFunction } from 'express';
import tokenService from '../services/tokenService.js';
import { AuthErrors } from '../types/errors.js';

/**
 * Extend Express namespace to support authenticated users
 * Passport already defines Express.User, we just need to populate it
 */
declare global {
  namespace Express {
    // Passport defines an empty User interface, we extend it here
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User {
      // This can be AccessTokenPayload (JWT) or UserRow (OAuth)
      // We use structural typing - any object with these properties
      id?: string;
      email?: string;
      sub?: string;
      [key: string]: any;
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
  _res: Response,
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
