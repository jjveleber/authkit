import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import pool from '../config/database.js';
import env from '../config/env.js';

interface AccessTokenPayload {
  sub: string;      // user ID
  email: string;
  iat: number;
  exp: number;      // 15 minutes
}

interface RefreshTokenData {
  userId: string;
  token: string;
  expiresAt: Date;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
}

class TokenService {
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;

  /**
   * Generate JWT access token (short-lived, stateless)
   */
  generateAccessToken(userId: string, email: string): string {
    const payload = {
      sub: userId,
      email,
    };

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });
  }

  /**
   * Verify and decode JWT access token
   */
  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
      return decoded;
    } catch (error) {
      // Check TokenExpiredError first since it's a subclass of JsonWebTokenError
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Generate refresh token (long-lived, stored in DB)
   */
  async generateRefreshToken(userId: string): Promise<RefreshTokenData> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const result = await pool.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, token, expires_at`,
      [userId, token, expiresAt]
    );

    const row = result.rows[0];
    return {
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Verify refresh token exists and is not expired
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenData | null> {
    const result = await pool.query<RefreshTokenRow>(
      `SELECT id, user_id, token, expires_at
       FROM refresh_tokens
       WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Check if token is expired
    if (row.expires_at < new Date()) {
      return null;
    }

    return {
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Revoke (delete) a refresh token
   */
  async revokeRefreshToken(token: string): Promise<void> {
    await pool.query(
      `DELETE FROM refresh_tokens WHERE token = $1`,
      [token]
    );
  }
}

export default new TokenService();
