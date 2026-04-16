# AuthKit - Project Plan

**Project Type:** Authentication Microservice  
**Build Time:** 1-2 days  
**Difficulty:** Intermediate

## What You're Building

Production-ready auth service providing JWT + OAuth2 (Google/GitHub) + email verification + password reset. Drop-in auth for any backend project. Like Auth0 but self-hosted.

**Key Value:** Reusable auth service demonstrating JWT patterns (26% of Upwork jobs require auth).

## Clarifying Questions (Ask User First)

1. **OAuth providers:** Google only or Google + GitHub?  
   *Recommendation: Both (GitHub adds 30min)*

2. **Email service:** Real SMTP (SendGrid) or fake (Ethereal)?  
   *Recommendation: Ethereal for demo, document how to swap*

3. **Refresh tokens:** JWT-only or access + refresh pattern?  
   *Recommendation: Both - access token (15min) + refresh token (7 days)*

## Tech Stack

- **Runtime:** Node.js 20 LTS + Express 5
- **Language:** TypeScript 5.6 (strict mode)
- **Database:** PostgreSQL 16
- **Libraries:** Passport.js, jsonwebtoken, bcrypt, zod
- **Deployment:** Docker

## Implementation Plan

### Phase 1: TypeScript Setup (1 hour)

**Initialize:**
```bash
npm init -y
npm install express@5 typescript@5.6 @types/node @types/express \
  pg jsonwebtoken bcrypt zod passport passport-google-oauth20 \
  dotenv cors express-rate-limit

npm install -D ts-node @types/bcrypt @types/jsonwebtoken jest supertest

npx tsc --init --strict --target ES2022 --module NodeNext
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "target": "ES2022",
    "module": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

**Project Structure:**
```
src/
├── index.ts
├── config/
│   ├── database.ts
│   ├── env.ts
│   └── passport.ts
├── routes/
│   ├── auth.ts
│   └── oauth.ts
├── controllers/
│   ├── authController.ts
│   └── oauthController.ts
├── middleware/
│   ├── authenticate.ts
│   └── validate.ts
├── services/
│   ├── tokenService.ts
│   └── passwordService.ts
└── types/
    └── express.d.ts
```

### Phase 2: Database Schema (1 hour)

**SQL (migrations/001_init.sql):**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),  -- null for OAuth users
  name VARCHAR(255),
  email_verified BOOLEAN DEFAULT FALSE,
  oauth_provider VARCHAR(50),  -- 'google', 'github', null
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

### Phase 3: Auth Core (3 hours)

**Services (src/services/tokenService.ts):**
```typescript
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

export const tokenService = {
  generateAccessToken(userId: string, email: string): string {
    return jwt.sign(
      { sub: userId, email },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );
  },

  async generateRefreshToken(userId: string): Promise<string> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, token, expiresAt]
    );
    
    return token;
  },

  verifyAccessToken(token: string) {
    return jwt.verify(token, process.env.JWT_SECRET!);
  }
};
```

**Password Service (src/services/passwordService.ts):**
```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const passwordService = {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
};
```

**Validation (schemas using Zod):**
```typescript
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special char'),
  name: z.string().min(1).max(255)
});
```

### Phase 4: Auth Routes (2 hours)

**Controllers (src/controllers/authController.ts):**
```typescript
export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const { email, password, name } = registerSchema.parse(req.body);
    
    const passwordHash = await passwordService.hash(password);
    
    const result = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, passwordHash, name]
    );
    
    const user = result.rows[0];
    const accessToken = tokenService.generateAccessToken(user.id, user.email);
    const refreshToken = await tokenService.generateRefreshToken(user.id);
    
    res.status(201).json({ user, tokens: { accessToken, refreshToken } });
  },

  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;
    
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    
    if (!user || !await passwordService.verify(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    
    const accessToken = tokenService.generateAccessToken(user.id, user.email);
    const refreshToken = await tokenService.generateRefreshToken(user.id);
    
    res.json({ user: { id: user.id, email: user.email }, tokens: { accessToken, refreshToken } });
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    
    const result = await db.query(
      'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [refreshToken]
    );
    
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }
    
    const userId = result.rows[0].user_id;
    const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    const accessToken = tokenService.generateAccessToken(userId, user.rows[0].email);
    
    res.json({ accessToken });
  }
};
```

### Phase 5: OAuth (Google) (2 hours)

**Passport Config (src/config/passport.ts):**
```typescript
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: '/oauth/callback'
},
async (accessToken, refreshToken, profile, done) => {
  const email = profile.emails?.[0].value;
  
  let user = await db.query('SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2', ['google', profile.id]);
  
  if (user.rows.length === 0) {
    user = await db.query(
      'INSERT INTO users (email, oauth_provider, oauth_id, email_verified) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, 'google', profile.id, true]
    );
  }
  
  done(null, user.rows[0]);
}));
```

### Phase 6: Docker & Testing (2 hours)

**Dockerfile:**
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

**docker-compose.yml:**
```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: authkit
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
```

## Environment Variables

```
DATABASE_URL=postgresql://postgres:postgres@db:5432/authkit
JWT_SECRET=your-256-bit-secret-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
PORT=3000
```

## Testing Locally

```bash
# Start services
docker-compose up

# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!@#","name":"Test User"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!@#"}'

# Refresh token
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<token>"}'
```

## Success Criteria

- ✅ Register/login returns JWT tokens
- ✅ Refresh token flow works
- ✅ Google OAuth works (creates user if new)
- ✅ Password validation enforced
- ✅ JWT middleware protects routes
- ✅ Docker Compose works
- ✅ TypeScript strict mode, no `any`

## Reference

See CLAUDE.md for TypeScript patterns, auth best practices, security requirements.
