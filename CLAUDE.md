# AuthKit - Development Guidelines

## Project Type

**Authentication Microservice**

Standalone auth service providing JWT + OAuth2 authentication for other services. Drop-in replacement for Auth0/Clerk - self-hosted, production-ready.

## Tech Stack

- Node.js 20 LTS + Express 5 + TypeScript 5.6
- PostgreSQL 16
- Passport.js (OAuth)
- jsonwebtoken (JWT)
- bcrypt (password hashing)
- Docker

## Architecture Principles

### TypeScript Standards

1. **Strict Mode Always:**
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitAny": true,
       "strictNullChecks": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true
     }
   }
   ```

2. **Type Everything:**
   ```typescript
   // Good: Explicit types
   interface User {
     id: string;
     email: string;
     passwordHash?: string;  // null for OAuth users
     emailVerified: boolean;
   }
   
   async function createUser(email: string, password: string): Promise<User> {
     // ...
   }
   
   // Bad: any types
   function createUser(data: any): Promise<any> { }
   ```

3. **No `any` - Use Proper Types:**
   ```typescript
   // Good: Define request types
   interface RegisterRequest {
     email: string;
     password: string;
     name: string;
   }
   
   app.post('/auth/register', async (req: Request<{}, {}, RegisterRequest>, res) => {
     const { email, password, name } = req.body;
   });
   ```

### Express + TypeScript Patterns

1. **Project Structure:**
   ```
   src/
   ├── index.ts
   ├── config/
   ├── models/          # Database models
   ├── routes/          # Route definitions
   ├── controllers/     # Business logic
   ├── middleware/      # Auth, validation, errors
   ├── services/        # Token, email, password
   └── types/          # TypeScript interfaces
   ```

2. **Route Organization:**
   ```typescript
   // routes/auth.ts
   import { Router } from 'express';
   import { authController } from '../controllers/authController';
   import { validateRequest } from '../middleware/validate';
   import { registerSchema } from '../schemas';
   
   const router = Router();
   
   router.post('/register', validateRequest(registerSchema), authController.register);
   router.post('/login', validateRequest(loginSchema), authController.login);
   
   export default router;
   ```

3. **Controller Pattern:**
   ```typescript
   // controllers/authController.ts
   import { Request, Response } from 'express';
   
   export const authController = {
     async register(req: Request, res: Response): Promise<void> {
       try {
         const user = await userService.create(req.body);
         const tokens = tokenService.generate(user);
         res.status(201).json({ user, tokens });
       } catch (error) {
         res.status(400).json({ error: error.message });
       }
     }
   };
   ```

### Authentication Patterns

1. **JWT Strategy (Access + Refresh):**
   ```typescript
   // Access token: short-lived, stateless
   interface AccessTokenPayload {
     sub: string;      // user ID
     email: string;
     iat: number;
     exp: number;      // 15 minutes
   }
   
   // Refresh token: long-lived, stored in DB
   interface RefreshToken {
     id: string;
     userId: string;
     token: string;    // random UUID
     expiresAt: Date;  // 7 days
   }
   ```

2. **Password Handling:**
   ```typescript
   import bcrypt from 'bcrypt';
   
   const SALT_ROUNDS = 10;
   
   async function hashPassword(password: string): Promise<string> {
     return bcrypt.hash(password, SALT_ROUNDS);
   }
   
   async function verifyPassword(password: string, hash: string): Promise<boolean> {
     return bcrypt.compare(password, hash);
   }
   ```

3. **JWT Middleware:**
   ```typescript
   // middleware/authenticate.ts
   import jwt from 'jsonwebtoken';
   
   export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
     const authHeader = req.headers.authorization;
     const token = authHeader?.split(' ')[1];
     
     if (!token) {
       return res.status(401).json({ error: 'No token provided' });
     }
     
     jwt.verify(token, process.env.JWT_SECRET!, (err, user) => {
       if (err) {
         return res.status(403).json({ error: 'Invalid token' });
       }
       req.user = user;
       next();
     });
   };
   ```

4. **OAuth2 Flow (Passport.js):**
   ```typescript
   import passport from 'passport';
   import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
   
   passport.use(new GoogleStrategy({
     clientID: process.env.GOOGLE_CLIENT_ID!,
     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
     callbackURL: '/oauth/callback'
   },
   async (accessToken, refreshToken, profile, done) => {
     const user = await findOrCreateUser({
       email: profile.emails[0].value,
       oauthProvider: 'google',
       oauthId: profile.id
     });
     done(null, user);
   }));
   ```

### Database Patterns (PostgreSQL)

1. **Schema:**
   ```sql
   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email VARCHAR(255) UNIQUE NOT NULL,
     password_hash VARCHAR(255),  -- null for OAuth users
     name VARCHAR(255),
     email_verified BOOLEAN DEFAULT FALSE,
     oauth_provider VARCHAR(50),
     oauth_id VARCHAR(255),
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW()
   );
   
   CREATE TABLE refresh_tokens (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     token VARCHAR(255) UNIQUE NOT NULL,
     expires_at TIMESTAMP NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );
   
   CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
   CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
   ```

2. **Use Query Builder or ORM:**
   ```typescript
   // Option 1: pg (raw SQL with safety)
   import { Pool } from 'pg';
   
   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
   
   async function findUserByEmail(email: string): Promise<User | null> {
     const result = await pool.query(
       'SELECT * FROM users WHERE email = $1',
       [email]
     );
     return result.rows[0] || null;
   }
   
   // Option 2: Prisma (recommended for TypeScript)
   import { PrismaClient } from '@prisma/client';
   const prisma = new PrismaClient();
   
   const user = await prisma.user.findUnique({ where: { email } });
   ```

### Security Requirements

1. **Password Validation:**
   - Minimum 8 characters
   - Must include: uppercase, lowercase, number, special char
   - Use `zod` for validation

2. **Token Security:**
   - JWT secret: 256-bit random string (env var)
   - Access token: 15 min expiry
   - Refresh token: 7 day expiry, stored hashed in DB
   - Rotate refresh tokens on use

3. **Rate Limiting:**
   ```typescript
   import rateLimit from 'express-rate-limit';
   
   const loginLimiter = rateLimit({
     windowMs: 15 * 60 * 1000,  // 15 minutes
     max: 5,  // 5 attempts
     message: 'Too many login attempts'
   });
   
   app.post('/auth/login', loginLimiter, authController.login);
   ```

4. **CORS:**
   ```typescript
   import cors from 'cors';
   
   app.use(cors({
     origin: process.env.ALLOWED_ORIGINS?.split(','),
     credentials: true
   }));
   ```

### Validation (Zod)

```typescript
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  name: z.string().min(1).max(255)
});

// Middleware
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      res.status(400).json({ error: error.errors });
    }
  };
};
```

### Error Handling

```typescript
// types/errors.ts
export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// middleware/errorHandler.ts
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
```

### Testing Requirements

1. **Tools:** Jest + Supertest + ts-jest
2. **Coverage:** >70% for controllers, services, middleware
3. **Test Structure:**
   ```
   tests/
   ├── auth.test.ts      # Register, login, refresh
   ├── oauth.test.ts     # OAuth flows
   ├── token.test.ts     # JWT generation/verification
   └── helpers.ts        # Test database setup
   ```

4. **Example Test:**
   ```typescript
   import request from 'supertest';
   import app from '../src/app';
   
   describe('POST /auth/register', () => {
     it('creates user and returns tokens', async () => {
       const res = await request(app)
         .post('/auth/register')
         .send({
           email: 'test@example.com',
           password: 'Test123!@#',
           name: 'Test User'
         });
       
       expect(res.status).toBe(201);
       expect(res.body).toHaveProperty('user');
       expect(res.body).toHaveProperty('tokens');
       expect(res.body.user.email).toBe('test@example.com');
     });
   });
   ```

## Code Quality

- **Linting:** ESLint + @typescript-eslint
- **Formatting:** Prettier
- **Pre-commit:** Husky + lint-staged
- **Type Checking:** `tsc --noEmit` in CI

## Environment Variables

Required:
- `DATABASE_URL`: PostgreSQL connection
- `JWT_SECRET`: 256-bit random string
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth secret

Optional:
- `GITHUB_CLIENT_ID`: GitHub OAuth
- `GITHUB_CLIENT_SECRET`: GitHub OAuth
- `SMTP_URL`: Email service (or use Ethereal for testing)
- `ALLOWED_ORIGINS`: CORS origins (comma-separated)

## Definition of Done

- ✅ TypeScript strict mode, no `any` types
- ✅ All routes have request validation (Zod)
- ✅ JWT + refresh token flow works
- ✅ OAuth (Google) works
- ✅ Password validation enforced
- ✅ Tests >70% coverage
- ✅ Rate limiting on auth endpoints
- ✅ Error handling middleware
- ✅ Docker builds and runs
- ✅ API documented in README

## Common Pitfalls

1. **Don't store JWT in database** - defeats stateless purpose
2. **Don't use JWT for sessions** - use refresh tokens
3. **Don't skip password validation** - enforce strong passwords
4. **Don't expose stack traces** - use error handler
5. **Don't commit secrets** - use .env
6. **Don't skip CORS** - will break frontend integration
7. **Don't use synchronous bcrypt** - use async version

Production-grade auth is critical for portfolio credibility.
