import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/authController.js';
import { validateRequest, registerSchema, loginSchema } from '../middleware/validate.js';

const router = Router();

/**
 * Rate limiter for login attempts
 * 5 attempts per 15 minutes per IP
 * Disabled in test environment
 */
const loginLimiter = process.env.NODE_ENV === 'test'
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      message: { error: 'Too many login attempts, please try again later' },
      standardHeaders: true,
      legacyHeaders: false,
    });

/**
 * Rate limiter for registration
 * 3 attempts per hour per IP
 * Disabled in test environment
 */
const registerLimiter = process.env.NODE_ENV === 'test'
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3,
      message: { error: 'Too many registration attempts, please try again later' },
      standardHeaders: true,
      legacyHeaders: false,
    });

/**
 * POST /auth/register
 * Register new user with email + password
 */
router.post(
  '/register',
  registerLimiter,
  validateRequest(registerSchema),
  authController.register
);

/**
 * POST /auth/login
 * Login with email + password
 */
router.post(
  '/login',
  loginLimiter,
  validateRequest(loginSchema),
  authController.login
);

/**
 * POST /auth/refresh
 * Exchange refresh token for new access token
 */
router.post('/refresh', authController.refresh);

export default router;
