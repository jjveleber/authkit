import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Register validation schema
 * - Email must be valid format
 * - Password must be 8+ chars with uppercase, lowercase, number, special char
 * - Name must be 1-255 characters
 */
export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must not exceed 255 characters'),
});

/**
 * Login validation schema
 * - Email must be valid format
 * - Password must be non-empty (no complexity requirements for login)
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Middleware factory for request validation
 */
export function validateRequest<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      } else {
        res.status(400).json({ error: 'Invalid request data' });
      }
    }
  };
}
