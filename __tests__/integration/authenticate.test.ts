import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import express, { type Express } from 'express';
import { authenticateJWT } from '../../src/middleware/authenticate.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('JWT Authentication Middleware', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: Express;

  // Setup: Start PostgreSQL container and run migrations
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withExposedPorts(5432)
      .start();

    const connectionString = container.getConnectionUri();

    process.env.DATABASE_URL = connectionString;
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3002';
    process.env.GOOGLE_CLIENT_ID = 'test-google-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';

    pool = new Pool({ connectionString });

    const migrationPath = path.join(process.cwd(), 'migrations/001_init.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
    await pool.query(migrationSQL);

    // Create test app with protected route
    app = express();
    app.use(express.json());

    // Test route: protected endpoint
    app.get('/protected', authenticateJWT, (req, res) => {
      res.status(200).json({
        message: 'Access granted',
        user: req.user,
      });
    });

    app.use(errorHandler);
  }, 60000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM refresh_tokens');
    await pool.query('DELETE FROM users');
  });

  describe('JWT Token Validation', () => {
    let validToken: string;

    beforeEach(async () => {
      // Create a valid JWT token using tokenService
      const tokenService = (await import('../../src/services/tokenService.js')).default;

      // Insert a test user
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email`,
        ['jwt-test@example.com', 'hash', 'JWT Test']
      );

      const userId = result.rows[0].id;
      const email = result.rows[0].email;

      validToken = tokenService.generateAccessToken(userId, email);
    });

    it('should allow access with valid Bearer token', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Access granted');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'jwt-test@example.com');
    });

    it('should reject request without Authorization header', async () => {
      const response = await request(app).get('/protected');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('No token provided');
    });

    it('should reject request with invalid token format', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'InvalidFormat token123');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid token format');
    });

    it('should reject request with missing Bearer prefix', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', validToken);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid token format');
    });

    it('should reject request with invalid JWT', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid token');
    });

    it('should reject expired JWT token', async () => {
      // Create an expired token with explicit exp claim
      const jwt = require('jsonwebtoken');
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = jwt.sign(
        {
          sub: 'user123',
          email: 'test@example.com',
          iat: now - 3600, // Issued 1 hour ago
          exp: now - 1 // Expired 1 second ago
        },
        process.env.JWT_SECRET!
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      // Accept either "Token expired" or "Invalid token" - both are valid for expired tokens
      expect(['Token expired', 'Invalid token']).toContain(response.body.error);
    });

    it('should reject JWT signed with wrong secret', async () => {
      const jwt = require('jsonwebtoken');
      const wrongSecretToken = jwt.sign(
        { sub: 'user123', email: 'test@example.com' },
        'wrong-secret-key-that-is-different',
        { expiresIn: '15m' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${wrongSecretToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid token');
    });

    it('should attach decoded user data to request object', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toHaveProperty('sub');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user).toHaveProperty('iat');
      expect(response.body.user).toHaveProperty('exp');
    });
  });
});
