import { Request, Response, NextFunction } from 'express';
import tokenService from '../services/tokenService.js';
import type { AuthResponse } from '../types/auth.js';
import { AuthErrors } from '../types/errors.js';

/**
 * Database row structure for users table (from passport strategy)
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

export const oauthController = {
  /**
   * GET /oauth/google/callback
   * Handle Google OAuth callback and generate tokens
   */
  async googleCallback(
    req: Request,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      // User is attached to req by passport authenticate middleware
      const userRow = req.user as UserRow | undefined;

      if (!userRow) {
        return next(AuthErrors.unauthorized('OAuth authentication failed'));
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
   * GET /oauth/github/callback
   * Handle GitHub OAuth callback and generate tokens
   */
  async githubCallback(
    req: Request,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      // User is attached to req by passport authenticate middleware
      const userRow = req.user as UserRow | undefined;

      if (!userRow) {
        return next(AuthErrors.unauthorized('OAuth authentication failed'));
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
};
