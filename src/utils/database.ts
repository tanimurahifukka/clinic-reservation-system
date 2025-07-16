import { Pool, PoolClient } from 'pg';
import { logger } from './logger';

class DatabaseConnection {
  private pool: Pool | null = null;
  private static instance: DatabaseConnection;

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private async createPool(): Promise<Pool> {
    if (this.pool) {
      return this.pool;
    }

    try {
      // For Aurora Serverless, we use RDS Data API or connection pooling
      const connectionConfig = {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'clinic_reservation',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 5, // Maximum number of connections in the pool
        idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
        connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection could not be established
        statement_timeout: 30000, // Terminate any statement that takes more than 30 seconds
        query_timeout: 30000, // Terminate any query that takes more than 30 seconds
      };

      this.pool = new Pool(connectionConfig);

      // Handle pool errors
      this.pool.on('error', (err) => {
        logger.error('Database pool error', { error: err.message });
      });

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('Database connection pool created successfully');
      return this.pool;

    } catch (error) {
      logger.error('Failed to create database connection pool', { error });
      throw error;
    }
  }

  public async getConnection(): Promise<PoolClient> {
    const pool = await this.createPool();
    return pool.connect();
  }

  public async query(text: string, params?: any[]): Promise<any> {
    const pool = await this.createPool();
    const start = Date.now();
    
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Database query executed', {
        query: text,
        duration: `${duration}ms`,
        rows: result.rowCount
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: text,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getConnection();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Database transaction failed', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection pool closed');
    }
  }
}

export const db = DatabaseConnection.getInstance();