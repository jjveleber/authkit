# AuthKit

**Production-ready authentication microservice** providing JWT-based authentication with OAuth2 support. A self-hosted, drop-in replacement for services like Auth0 or Clerk.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://www.postgresql.org/)
[![Tests](https://img.shields.io/badge/tests-100%2B_passing-brightgreen)](/)

## Features

- **JWT Authentication**: Stateless access tokens (15-minute expiry) + database-backed refresh tokens (7-day expiry)
- **OAuth2 Integration**: Google and GitHub sign-in support via Passport.js
- **Secure Password Handling**: bcrypt hashing with enforced password strength requirements
- **Rate Limiting**: Protection against brute-force attacks (configurable per endpoint)
- **Type Safety**: Written in TypeScript with strict mode enabled
- **Production Ready**: Docker support, comprehensive test coverage (100+ tests), error handling
- **CORS Support**: Configurable cross-origin resource sharing for frontend integration
- **Database Migrations**: PostgreSQL schema with referential integrity

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20 LTS (for local development)

### Run with Docker Compose

```bash
# 1. Clone the repository
git clone <repository-url>
cd authkit

# 2. Create environment file
cp .env.example .env

# 3. Edit .env and set JWT_SECRET (required)
# Generate a secure secret:
openssl rand -base64 32

# 4. Start services
docker-compose up -d

# 5. Test the API
curl http://localhost:3000/health
```

The API will be available at `http://localhost:3000`.

### Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your PostgreSQL connection and secrets

# Run migrations (requires PostgreSQL running)
psql $DATABASE_URL < migrations/001_init.sql

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

## API Documentation

### Base URL

```
http://localhost:3000
```

### Authentication Endpoints

#### Register New User

**POST** `/auth/register`

Creates a new user account with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!@#",
  "name": "John Doe"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

**Response (201 Created):**
```json
{
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": false,
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "uuid-refresh-token"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid input (weak password, invalid email)
- `409 Conflict`: Email already exists
- `429 Too Many Requests`: Rate limit exceeded (3 attempts/hour)

---

#### Login

**POST** `/auth/login`

Authenticate with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!@#"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": false
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "uuid-refresh-token"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid credentials
- `429 Too Many Requests`: Rate limit exceeded (5 attempts/15 minutes)

---

#### Refresh Token

**POST** `/auth/refresh`

Exchange a refresh token for a new access token.

**Request Body:**
```json
{
  "refreshToken": "uuid-refresh-token"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `403 Forbidden`: Invalid or expired refresh token

---

### OAuth Endpoints

#### Google OAuth

**GET** `/oauth/google`

Initiates Google OAuth flow. Redirects to Google sign-in.

**GET** `/oauth/google/callback`

Callback endpoint for Google OAuth. Returns JSON tokens.

**Response (200 OK):**
```json
{
  "user": {
    "id": "uuid-here",
    "email": "user@gmail.com",
    "name": "John Doe",
    "emailVerified": true,
    "oauthProvider": "google"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "uuid-refresh-token"
  }
}
```

---

#### GitHub OAuth

**GET** `/oauth/github`

Initiates GitHub OAuth flow. Redirects to GitHub sign-in.

**GET** `/oauth/github/callback`

Callback endpoint for GitHub OAuth. Returns JSON tokens.

**Response:** Same format as Google OAuth callback.

---

### Health Check

**GET** `/health`

Returns service health status.

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

---

## Environment Variables

Create a `.env` file based on `.env.example`:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/authkit` |
| `JWT_SECRET` | Yes | Secret key for JWT signing (256-bit recommended) | - |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID | - |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret | - |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client ID | - |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth client secret | - |
| `PORT` | No | Server port | `3000` |
| `NODE_ENV` | No | Environment (`development`, `production`, `test`) | `development` |

### Generating JWT Secret

```bash
openssl rand -base64 32
```

### Setting up OAuth

**Google OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable "Google+ API"
3. Create OAuth 2.0 credentials
4. Set authorized redirect URI: `http://localhost:3000/oauth/google/callback`
5. Copy Client ID and Client Secret to `.env`

**GitHub OAuth:**
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set authorization callback URL: `http://localhost:3000/oauth/github/callback`
4. Copy Client ID and Client Secret to `.env`

---

## Testing

The project includes comprehensive test coverage:

- **Unit Tests**: 54 tests (services, middleware, validation)
- **Integration Tests**: 36 tests (API endpoints with real database)
- **E2E Tests**: 10+ tests (complete user journeys)

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- __tests__/e2e/user-journeys.test.ts
```

### Test Coverage

Current coverage: **>70%** across all modules

```bash
# View coverage report
npm test -- --coverage
```

---

## Docker Deployment

### Building the Image

```bash
docker build -t authkit:latest .
```

### Running with Docker Compose

```bash
# Start all services (API + PostgreSQL)
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down

# Stop and remove volumes (clears database)
docker-compose down -v
```

### Manual Docker Run

```bash
# Start PostgreSQL
docker run -d \
  --name authkit-db \
  -e POSTGRES_DB=authkit \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16-alpine

# Run migrations
psql postgresql://postgres:postgres@localhost:5432/authkit < migrations/001_init.sql

# Start API
docker run -d \
  --name authkit-api \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/authkit \
  -e JWT_SECRET=your-secret-here \
  -e PORT=3000 \
  -p 3000:3000 \
  authkit:latest
```

---

## Architecture

### Tech Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: Express 5
- **Language**: TypeScript 5.6 (strict mode)
- **Database**: PostgreSQL 16
- **Authentication**: Passport.js (OAuth), jsonwebtoken (JWT), bcrypt (passwords)
- **Validation**: Zod
- **Testing**: Jest, Supertest, Testcontainers

### Project Structure

```
authkit/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Express app setup
│   ├── config/
│   │   ├── database.ts       # PostgreSQL connection
│   │   ├── env.ts            # Environment validation
│   │   └── passport.ts       # OAuth strategies
│   ├── controllers/
│   │   ├── authController.ts # Register, login, refresh
│   │   └── oauthController.ts # OAuth callbacks
│   ├── middleware/
│   │   ├── authenticate.ts   # JWT verification
│   │   ├── errorHandler.ts   # Global error handling
│   │   └── validate.ts       # Request validation
│   ├── routes/
│   │   ├── auth.ts           # Auth endpoints
│   │   └── oauth.ts          # OAuth endpoints
│   ├── services/
│   │   ├── tokenService.ts   # JWT + refresh token logic
│   │   └── passwordService.ts # Password hashing/verification
│   └── types/
│       └── errors.ts         # Custom error classes
├── migrations/
│   └── 001_init.sql          # Database schema
├── __tests__/
│   ├── services/             # Unit tests
│   ├── middleware/           # Middleware tests
│   ├── integration/          # API integration tests
│   └── e2e/                  # End-to-end tests
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Database Schema

**users**
- `id` (UUID, primary key)
- `email` (unique, indexed)
- `password_hash` (nullable for OAuth users)
- `name`
- `email_verified` (boolean)
- `oauth_provider` (google, github, null)
- `oauth_id` (indexed)
- `created_at`, `updated_at`

**refresh_tokens**
- `id` (UUID, primary key)
- `user_id` (foreign key → users, cascade delete)
- `token` (UUID, unique, indexed)
- `expires_at` (timestamp)
- `created_at`

---

## Production Deployment

### Checklist

- [ ] Set strong `JWT_SECRET` (use `openssl rand -base64 32`)
- [ ] Use managed PostgreSQL (AWS RDS, Google Cloud SQL, etc.)
- [ ] Set `NODE_ENV=production`
- [ ] Configure CORS `ALLOWED_ORIGINS` for your frontend domains
- [ ] Enable HTTPS (use reverse proxy like nginx or Caddy)
- [ ] Set up database backups
- [ ] Configure OAuth callback URLs for production domain
- [ ] Monitor logs and errors (Sentry, LogRocket, etc.)
- [ ] Set up health check monitoring
- [ ] Configure rate limits based on your traffic

### Example Production Setup (nginx + Docker)

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name auth.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Scaling Considerations

- **Horizontal Scaling**: AuthKit is stateless (except refresh tokens in DB). Run multiple instances behind a load balancer.
- **Database Connection Pooling**: Default pool size is 10. Adjust via `PGMAXCONNECTIONS` if needed.
- **Rate Limiting**: Current limits are conservative. Adjust in `src/routes/auth.ts` based on your needs.
- **Token Cleanup**: Set up a cron job to delete expired refresh tokens:
  ```sql
  DELETE FROM refresh_tokens WHERE expires_at < NOW();
  ```

---

## Security

### Password Security
- Bcrypt hashing with 10 salt rounds
- Strong password requirements enforced via Zod validation
- No plaintext passwords stored or logged

### Token Security
- Access tokens: Short-lived (15 minutes), stateless JWT
- Refresh tokens: Long-lived (7 days), stored in database, single-use recommended
- JWT secret must be 256-bit random string
- Tokens transmitted via Authorization header only

### Rate Limiting
- Registration: 3 attempts per hour (per IP)
- Login: 5 attempts per 15 minutes (per IP)
- Customizable via `express-rate-limit`

### CORS
- Configurable allowed origins
- Credentials support for cookie-based authentication (if added)

### OAuth Security
- State parameter validation (handled by Passport.js)
- Secure callback handling
- Email verification required from OAuth providers

---

## Troubleshooting

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1"

# Check if migrations ran
psql $DATABASE_URL -c "\dt"
```

### JWT Verification Errors

```bash
# Verify JWT_SECRET is set correctly
echo $JWT_SECRET | wc -c  # Should be >32 characters

# Decode JWT (without verification) to inspect claims
# Use https://jwt.io or:
node -e "console.log(JSON.parse(Buffer.from('YOUR_TOKEN'.split('.')[1], 'base64').toString()))"
```

### OAuth Callback Errors

- Verify callback URLs match exactly in OAuth provider settings
- Check CLIENT_ID and CLIENT_SECRET are correct
- Ensure OAuth app is enabled/published
- For Google: Make sure "Google+ API" is enabled

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## License

MIT

---

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions

---

## Roadmap

Future enhancements:
- [ ] Email verification flow
- [ ] Password reset via email
- [ ] Two-factor authentication (TOTP)
- [ ] Session management (active sessions list, logout all devices)
- [ ] Additional OAuth providers (Microsoft, Apple, Twitter)
- [ ] Webhook notifications for auth events
- [ ] Admin API for user management
- [ ] Rate limiting per user (not just IP)
- [ ] Refresh token rotation

---

**Built with TypeScript, Express, and PostgreSQL**
