import { Request, Response, NextFunction } from 'express';
import pool from '../config/database.js';
import tokenService from '../services/tokenService.js';
import passwordService from '../services/passwordService.js';
import { RegisterInput, LoginInput } from '../middleware/validate.js';
import { AuthError, AuthErrors } from '../types/errors.js';
import type { AuthResponse } from '../types/auth.js';

/**
 * Database row structure for users table
 */
interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  email_verified: boolean;
  oauth_provider: string | null;
  oauth_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert database row to API user response (omit password_hash)
 */
function mapUserRow(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.email_verified,
    oauthProvider: row.oauth_provider ?? undefined,
    oauthId: row.oauth_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const authController = {
  /**
   * POST /auth/register
   * Register a new user with email + password
   */
  async register(
    req: Request<object, object, RegisterInput>,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password, name } = req.body;

      // Hash password
      const passwordHash = await passwordService.hash(password);

      // Insert user into database
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, password_hash, name, email_verified, oauth_provider, oauth_id, created_at, updated_at`,
        [email, passwordHash, name]
      );

      const userRow = result.rows[0];

      // Generate tokens
      const accessToken = tokenService.generateAccessToken(userRow.id, userRow.email);
      const refreshTokenData = await tokenService.generateRefreshToken(userRow.id);

      res.status(201).json({
        user: mapUserRow(userRow),
        tokens: {
          accessToken,
          refreshToken: refreshTokenData.token,
        },
      });
    } catch (error) {
      // Handle duplicate email constraint violation
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        return next(AuthErrors.conflict('Email already registered'));
      }
      next(error);
    }
  },

  /**
   * POST /auth/login
   * Login with email + password
   */
  async login(
    req: Request<object, object, LoginInput>,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password } = req.body;

      // Find user by email
      const result = await pool.query<UserRow>(
        `SELECT id, email, password_hash, name, email_verified, oauth_provider, oauth_id, created_at, updated_at
         FROM users
         WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return next(AuthErrors.unauthorized('Invalid credentials'));
      }

      const userRow = result.rows[0];

      // Check if user has a password (not OAuth-only)
      if (!userRow.password_hash) {
        return next(AuthErrors.unauthorized('This account uses OAuth login'));
      }

      // Verify password
      const isValid = await passwordService.verify(password, userRow.password_hash);
      if (!isValid) {
        return next(AuthErrors.unauthorized('Invalid credentials'));
      }

      // Generate tokens
      const accessToken = tokenService.generateAccessToken(userRow.id, userRow.email);
      const refreshTokenData = await tokenService.generateRefreshToken(userRow.id);

      res.status(200).json({
        user: mapUserRow(userRow),
        tokens: {
          accessToken,
          refreshToken: refreshTokenData.token,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /auth/refresh
   * Exchange refresh token for new access token
   */
  async refresh(
    req: Request<object, object, { refreshToken: string }>,
    res: Response<{ accessToken: string }>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return next(AuthErrors.badRequest('Refresh token is required'));
      }

      // Verify refresh token
      const tokenData = await tokenService.verifyRefreshToken(refreshToken);
      if (!tokenData) {
        return next(AuthErrors.unauthorized('Invalid or expired refresh token'));
      }

      // Get user email for new access token
      const result = await pool.query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1`,
        [tokenData.userId]
      );

      if (result.rows.length === 0) {
        return next(AuthErrors.unauthorized('User not found'));
      }

      // Generate new access token
      const accessToken = tokenService.generateAccessToken(
        tokenData.userId,
        result.rows[0].email
      );

      res.status(200).json({ accessToken });
    } catch (error) {
      next(error);
    }
  },
};
