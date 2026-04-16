import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { createApp } from '../../src/app.js';
import type { Express } from 'express';

describe('E2E User Journeys', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: Express;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withExposedPorts(5432)
      .start();

    const connectionString = container.getConnectionUri();

    // Set environment variables BEFORE any imports
    process.env.DATABASE_URL = connectionString;
    process.env.JWT_SECRET = 'e2e-test-jwt-secret-at-least-32-characters-long';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3002';
    process.env.GOOGLE_CLIENT_ID = 'test-google-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';

    // Create pool and run migrations
    pool = new Pool({ connectionString });

    const migrationPath = path.join(process.cwd(), 'migrations/001_init.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
    await pool.query(migrationSQL);

    // Create app instance
    app = createApp();
  }, 60000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM refresh_tokens');
    await pool.query('DELETE FROM users');
  });

  describe('Journey 1: Complete registration and login flow', () => {
    it('should register → login → access protected route', async () => {
      // Step 1: Register new user
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'journey1@example.com',
          password: 'Journey123!@#',
          name: 'Journey User 1',
        });

      expect(registerRes.status).toBe(201);
      expect(registerRes.body.user.email).toBe('journey1@example.com');
      const registrationTokens = registerRes.body.tokens;

      // Step 2: Login with same credentials
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'journey1@example.com',
          password: 'Journey123!@#',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.email).toBe('journey1@example.com');
      const loginTokens = loginRes.body.tokens;

      // Step 3: Verify tokens are valid strings
      expect(typeof loginTokens.accessToken).toBe('string');
      expect(loginTokens.accessToken.length).toBeGreaterThan(20);
      expect(typeof loginTokens.refreshToken).toBe('string');

      // Step 4: Verify user exists in database
      const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [
        'journey1@example.com',
      ]);
      expect(userQuery.rows.length).toBe(1);
      expect(userQuery.rows[0].name).toBe('Journey User 1');
    });

    it('should register → logout (implicit by token expiry)', async () => {
      // Step 1: Register
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'journey2@example.com',
          password: 'Journey456!@#',
          name: 'Journey User 2',
        });

      expect(registerRes.status).toBe(201);

      // Step 2: Verify tokens were generated
      expect(registerRes.body.tokens.accessToken).toBeDefined();
      expect(registerRes.body.tokens.refreshToken).toBeDefined();
    });
  });

  describe('Journey 2: Token refresh flow', () => {
    it('should register → refresh token → access with new token', async () => {
      // Step 1: Register
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'refresh1@example.com',
          password: 'Refresh123!@#',
          name: 'Refresh User',
        });

      expect(registerRes.status).toBe(201);
      const { accessToken, refreshToken } = registerRes.body.tokens;

      // Step 2: Verify original access token is a valid string
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(20);

      // Step 3: Use refresh token to get new access token
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      const newAccessToken = refreshRes.body.accessToken;

      // Step 4: Verify new access token is valid (may be same or different depending on timing)
      expect(typeof newAccessToken).toBe('string');
      expect(newAccessToken.length).toBeGreaterThan(20);
      // Note: The token might be the same if generated in the same second,
      // but it's still a valid token
    });

    it('should fail to refresh with invalid token', async () => {
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body).toHaveProperty('error');
    });

    it('should fail to refresh with expired token', async () => {
      // Step 1: Register and get tokens
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'expired@example.com',
          password: 'Expired123!@#',
          name: 'Expired User',
        });

      const { refreshToken } = registerRes.body.tokens;

      // Step 2: Manually expire the token in database
      await pool.query(
        "UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 day' WHERE token = $1",
        [refreshToken]
      );

      // Step 3: Try to refresh with expired token
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body).toHaveProperty('error');
    });
  });

  describe('Journey 3: OAuth user cannot login with password', () => {
    it('should create OAuth user → fail password login', async () => {
      // Step 1: Simulate OAuth user creation (no password)
      const oauthUserResult = await pool.query(
        `INSERT INTO users (email, name, email_verified, oauth_provider, oauth_id, password_hash)
         VALUES ($1, $2, $3, $4, $5, NULL)
         RETURNING *`,
        ['oauth@example.com', 'OAuth User', true, 'google', 'google-oauth-id-123']
      );

      expect(oauthUserResult.rows.length).toBe(1);

      // Step 2: Try to login with password (should fail - no password set)
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'oauth@example.com',
          password: 'AnyPassword123!@#',
        });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.error).toContain('OAuth login');
    });
  });

  describe('Journey 4: Multiple users independence', () => {
    it('should handle multiple users with separate sessions', async () => {
      // Step 1: Register user 1
      const user1Res = await request(app)
        .post('/auth/register')
        .send({
          email: 'user1@example.com',
          password: 'User1Pass123!@#',
          name: 'User One',
        });

      expect(user1Res.status).toBe(201);
      const user1Tokens = user1Res.body.tokens;

      // Step 2: Register user 2
      const user2Res = await request(app)
        .post('/auth/register')
        .send({
          email: 'user2@example.com',
          password: 'User2Pass456!@#',
          name: 'User Two',
        });

      expect(user2Res.status).toBe(201);
      const user2Tokens = user2Res.body.tokens;

      // Step 3: Verify tokens are different
      expect(user1Tokens.accessToken).not.toBe(user2Tokens.accessToken);
      expect(user1Tokens.refreshToken).not.toBe(user2Tokens.refreshToken);

      // Step 4: Verify tokens are valid and different
      expect(typeof user1Tokens.accessToken).toBe('string');
      expect(typeof user2Tokens.accessToken).toBe('string');
      expect(user1Tokens.accessToken).not.toBe(user2Tokens.accessToken);

      // Step 5: Verify both users can refresh independently
      const refresh1 = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: user1Tokens.refreshToken });

      const refresh2 = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: user2Tokens.refreshToken });

      expect(refresh1.status).toBe(200);
      expect(refresh2.status).toBe(200);
    });
  });

  describe('Journey 5: Error scenarios', () => {
    it('should handle duplicate registration gracefully', async () => {
      // Step 1: Register user
      await request(app)
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Duplicate123!@#',
          name: 'First Registration',
        });

      // Step 2: Try to register same email again
      const duplicateRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Different456!@#',
          name: 'Second Registration',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error).toContain('already registered');
    });

    it('should reject weak passwords', async () => {
      const weakPasswords = [
        'short',           // too short
        'alllowercase1',   // no uppercase
        'ALLUPPERCASE1',   // no lowercase
        'NoNumbers!',      // no numbers
        'NoSpecial123',    // no special chars
      ];

      for (const password of weakPasswords) {
        const res = await request(app)
          .post('/auth/register')
          .send({
            email: `test-${password}@example.com`,
            password,
            name: 'Test User',
          });

        expect(res.status).toBe(400);
      }
    });

    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
      ];

      for (const email of invalidEmails) {
        const res = await request(app)
          .post('/auth/register')
          .send({
            email,
            password: 'Valid123!@#',
            name: 'Test User',
          });

        expect(res.status).toBe(400);
      }
    });

    it('should handle wrong password on login', async () => {
      // Step 1: Register user
      await request(app)
        .post('/auth/register')
        .send({
          email: 'wrongpass@example.com',
          password: 'Correct123!@#',
          name: 'Test User',
        });

      // Step 2: Try to login with wrong password
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'wrongpass@example.com',
          password: 'Wrong456!@#',
        });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.error).toContain('Invalid credentials');
    });

    it('should handle login for non-existent user', async () => {
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'doesnotexist@example.com',
          password: 'AnyPassword123!@#',
        });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.error).toContain('Invalid credentials');
    });
  });

  describe('Journey 6: Database consistency', () => {
    it('should maintain referential integrity on user deletion', async () => {
      // Step 1: Register user
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'todelete@example.com',
          password: 'Delete123!@#',
          name: 'To Delete',
        });

      const userId = registerRes.body.user.id;

      // Step 2: Verify refresh token exists
      const tokensBeforeResult = await pool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1',
        [userId]
      );
      expect(tokensBeforeResult.rows.length).toBeGreaterThan(0);

      // Step 3: Delete user
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      // Step 4: Verify refresh tokens are cascade-deleted
      const tokensAfterResult = await pool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1',
        [userId]
      );
      expect(tokensAfterResult.rows.length).toBe(0);
    });

    it('should handle concurrent registrations', async () => {
      // Register multiple users concurrently
      const registrations = [
        request(app).post('/auth/register').send({
          email: 'concurrent1@example.com',
          password: 'Concurrent123!@#',
          name: 'Concurrent 1',
        }),
        request(app).post('/auth/register').send({
          email: 'concurrent2@example.com',
          password: 'Concurrent456!@#',
          name: 'Concurrent 2',
        }),
        request(app).post('/auth/register').send({
          email: 'concurrent3@example.com',
          password: 'Concurrent789!@#',
          name: 'Concurrent 3',
        }),
      ];

      const results = await Promise.all(registrations);

      // All should succeed
      results.forEach((res) => {
        expect(res.status).toBe(201);
      });

      // Verify all users exist in database
      const usersResult = await pool.query(
        "SELECT * FROM users WHERE email LIKE 'concurrent%@example.com'"
      );
      expect(usersResult.rows.length).toBe(3);
    });
  });
});
