import jwt from 'jsonwebtoken';

//Mock needs to be before imports
jest.mock('../../src/config/database.js');

import tokenService from '../../src/services/tokenService.js';
import db from '../../src/config/database.js';

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;

describe('tokenService', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockEmail = 'test@example.com';
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars-long';

  beforeEach(() => {
    jest.clearAllMocks();
    // Set JWT_SECRET for tests
    process.env.JWT_SECRET = JWT_SECRET;
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const token = tokenService.generateAccessToken(mockUserId, mockEmail);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should include userId and email in token payload', () => {
      const token = tokenService.generateAccessToken(mockUserId, mockEmail);
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      expect(decoded.sub).toBe(mockUserId);
      expect(decoded.email).toBe(mockEmail);
    });

    it('should set token expiry to 15 minutes', () => {
      const token = tokenService.generateAccessToken(mockUserId, mockEmail);
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      const expectedExpiry = Math.floor(Date.now() / 1000) + 15 * 60;
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiry - 2); // Allow 2s tolerance
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 2);
    });

    it('should include iat (issued at) timestamp', () => {
      const token = tokenService.generateAccessToken(mockUserId, mockEmail);
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      expect(decoded.iat).toBeDefined();
      expect(typeof decoded.iat).toBe('number');
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and decode valid token', () => {
      const token = tokenService.generateAccessToken(mockUserId, mockEmail);
      const decoded = tokenService.verifyAccessToken(token);

      expect(decoded.sub).toBe(mockUserId);
      expect(decoded.email).toBe(mockEmail);
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        tokenService.verifyAccessToken('invalid.token.here');
      }).toThrow();
    });

    it('should throw error for expired token', () => {
      // Create token that expires immediately
      const expiredToken = jwt.sign(
        { sub: mockUserId, email: mockEmail },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );

      expect(() => {
        tokenService.verifyAccessToken(expiredToken);
      }).toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'refresh-token-id', token: 'c7e5c4e7-8f47-4c3e-b8e6-a9f5e8d6c3b2', user_id: mockUserId, expires_at: new Date() }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });
    });

    it('should generate a UUID refresh token', async () => {
      const result = await tokenService.generateRefreshToken(mockUserId);

      expect(typeof result.token).toBe('string');
      expect(result.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(result.userId).toBe(mockUserId);
    });

    it('should store refresh token in database', async () => {
      await tokenService.generateRefreshToken(mockUserId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refresh_tokens'),
        expect.arrayContaining([mockUserId, expect.any(String), expect.any(Date)])
      );
    });

    it('should set expiry to 7 days', async () => {
      await tokenService.generateRefreshToken(mockUserId);

      const callArgs = mockQuery.mock.calls[0][1] as any[];
      const expiresAt = callArgs[2] as Date;
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Allow 1 second tolerance
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry.getTime() - 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry.getTime() + 1000);
    });

    it('should return the generated token data', async () => {
      const result = await tokenService.generateRefreshToken(mockUserId);

      expect(result).toBeTruthy();
      expect(result.token).toBeTruthy();
      expect(result.userId).toBe(mockUserId);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should throw error on database failure', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(tokenService.generateRefreshToken(mockUserId)).rejects.toThrow('Database error');
    });
  });

  describe('verifyRefreshToken', () => {
    const mockToken = 'valid-refresh-token';

    it('should return token data for valid refresh token', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      mockQuery.mockResolvedValue({
        rows: [{ id: '123', user_id: mockUserId, token: mockToken, expires_at: futureDate }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await tokenService.verifyRefreshToken(mockToken);

      expect(result).toBeTruthy();
      expect(result?.userId).toBe(mockUserId);
      expect(result?.token).toBe(mockToken);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [mockToken]
      );
    });

    it('should return null for invalid refresh token', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await tokenService.verifyRefreshToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for expired refresh token', async () => {
      const pastDate = new Date(Date.now() - 1000);
      mockQuery.mockResolvedValue({
        rows: [{ id: '123', user_id: mockUserId, token: mockToken, expires_at: pastDate }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await tokenService.verifyRefreshToken(mockToken);

      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    const mockToken = 'token-to-revoke';

    it('should delete refresh token from database', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: 'DELETE',
        oid: 0,
        fields: [],
      });

      await tokenService.revokeRefreshToken(mockToken);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM refresh_tokens'),
        [mockToken]
      );
    });

    it('should not throw error if token does not exist', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'DELETE',
        oid: 0,
        fields: [],
      });

      await expect(tokenService.revokeRefreshToken(mockToken)).resolves.not.toThrow();
    });
  });
});
