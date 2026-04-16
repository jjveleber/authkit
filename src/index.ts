import app from './app.js';
import env from './config/env.js';
import pool from './config/database.js';

const PORT = parseInt(env.PORT, 10);

/**
 * Start the HTTP server
 */
async function start(): Promise<void> {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    console.log('✅ Database connected');

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 AuthKit listening on port ${PORT}`);
      console.log(`📝 Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

start();
