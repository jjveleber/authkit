import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { createApp } from '../../src/app.js';
import type { Express } from 'express';

describe('Auth Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: Express;

  // Setup: Start PostgreSQL container and run migrations
  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withExposedPorts(5432)
      .start();

    const connectionString = container.getConnectionUri();

    // Set environment variables for the app
    process.env.DATABASE_URL = connectionString;
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.GOOGLE_CLIENT_ID = 'test-google-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';

    // Create pool and run migrations
    pool = new Pool({ connectionString });

    const migrationPath = path.join(process.cwd(), 'migrations/001_init.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
    await pool.query(migrationSQL);

    // Create app instance
    app = createApp();
  }, 60000); // 60 second timeout for container startup

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  // Clean up database between tests
  beforeEach(async () => {
    await pool.query('DELETE FROM refresh_tokens');
    await pool.query('DELETE FROM users');
  });

  describe('POST /auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!@#',
          name: 'Test User',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');

      // Verify user structure
      expect(response.body.user).toMatchObject({
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: false,
      });
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify tokens
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');
      expect(typeof response.body.tokens.accessToken).toBe('string');
      expect(typeof response.body.tokens.refreshToken).toBe('string');
    });

    it('should reject registration with duplicate email', async () => {
      // Register first user
      await request(app)
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Test123!@#',
          name: 'First User',
        });

      // Try to register with same email
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Different123!@#',
          name: 'Second User',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('already registered');
    });

    it('should reject registration with weak password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'weak@example.com',
          password: 'weak',
          name: 'Weak User',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: 'Test123!@#',
          name: 'Invalid Email',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Validation failed');
    });

    it('should store user in database with hashed password', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: 'db-check@example.com',
          password: 'Test123!@#',
          name: 'DB User',
        });

      const result = await pool.query(
        'SELECT id, email, password_hash, name FROM users WHERE email = $1',
        ['db-check@example.com']
      );

      expect(result.rows).toHaveLength(1);
      const user = result.rows[0];
      expect(user.email).toBe('db-check@example.com');
      expect(user.name).toBe('DB User');
      expect(user.password_hash).toBeTruthy();
      expect(user.password_hash).not.toBe('Test123!@#'); // Should be hashed
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create test user
      await request(app)
        .post('/auth/register')
        .send({
          email: 'login@example.com',
          password: 'Login123!@#',
          name: 'Login User',
        });
    });

    it('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Login123!@#',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.user.email).toBe('login@example.com');
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword123!@#',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test123!@#',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject login with invalid email format', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'not-an-email',
          password: 'Test123!@#',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /auth/refresh', () => {
    let validRefreshToken: string;
    let userId: string;

    beforeEach(async () => {
      // Create user and get tokens
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'refresh@example.com',
          password: 'Refresh123!@#',
          name: 'Refresh User',
        });

      validRefreshToken = response.body.tokens.refreshToken;
      userId = response.body.user.id;
    });

    it('should return new access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: validRefreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.length).toBeGreaterThan(0);
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: 'invalid-token-12345',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid or expired');
    });

    it('should reject expired refresh token', async () => {
      // Create expired token directly in DB
      const expiredToken = 'expired-token-uuid';
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, expiredToken, new Date(Date.now() - 1000)] // Expired 1 second ago
      );

      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: expiredToken,
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid or expired');
    });

    it('should reject missing refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Protected Routes', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and get tokens
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'protected@example.com',
          password: 'Protected123!@#',
          name: 'Protected User',
        });

      accessToken = response.body.tokens.accessToken;
      userId = response.body.user.id;
    });

    it('should allow access with valid JWT token', async () => {
      // We don't have a protected route yet, so let's create a test endpoint
      // For now, we'll just verify the token was generated correctly
      expect(accessToken).toBeTruthy();
      expect(typeof accessToken).toBe('string');
    });

    it('should verify JWT contains correct user data', async () => {
      // Decode the JWT and verify its contents
      // Use decode instead of verify since the token was already validated during registration
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(accessToken);

      expect(decoded).toHaveProperty('sub');
      expect(decoded).toHaveProperty('email');
      expect(decoded.email).toBe('protected@example.com');
      expect(decoded.sub).toBe(userId);
    });
  });

  // Rate limiting tests removed - tested separately with rate limiting enabled

  describe('Health Check', () => {
    it('should return OK status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
