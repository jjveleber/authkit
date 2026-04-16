// Set up test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/authkit_test';
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long-for-jwt-signing';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.PORT = '3000';
