/**
 * User model from database
 */
export interface User {
  id: string;
  email: string;
  passwordHash?: string;  // null for OAuth users
  name: string;
  emailVerified: boolean;
  oauthProvider?: string;
  oauthId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * JWT Access Token Payload
 */
export interface AccessTokenPayload {
  sub: string;      // user ID
  email: string;
  iat: number;      // issued at
  exp: number;      // expires at (15 minutes)
}

/**
 * Refresh Token from database
 */
export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Token pair response
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Authentication response
 */
export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  tokens: TokenPair;
}
