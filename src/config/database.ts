import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Lazy initialization to allow environment variables to be set in tests
let poolInstance: Pool | null = null;

function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection on startup (only in non-test environments)
    if (process.env.NODE_ENV !== 'test') {
      poolInstance.on('connect', () => {
        console.log('Database connected');
      });

      poolInstance.on('error', (err) => {
        console.error('Unexpected database error:', err);
        process.exit(-1);
      });
    }
  }
  return poolInstance;
}

// Create a wrapper object with explicit methods to make it mockable
const pool = {
  query: <R extends QueryResultRow = any, I extends any[] = any[]>(
    ...args: Parameters<Pool['query']>
  ): Promise<QueryResult<R>> => {
    return getPool().query(...args);
  },
  end: (): Promise<void> => {
    return getPool().end();
  },
  on: (...args: Parameters<Pool['on']>): Pool => {
    return getPool().on(...args);
  },
};

export default pool;
