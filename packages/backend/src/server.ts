import app from './app';
import db from './db';
import { config } from './config';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';

async function start() {
  // Ensure upload and log directories exist
  fs.mkdirSync(path.resolve(config.upload.dir), { recursive: true });
  fs.mkdirSync(path.resolve(config.log.dir), { recursive: true });

  // Test DB connection
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection established');
  } catch (err) {
    logger.error('Failed to connect to database:', err);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    logger.info(`SAK Staff API running on http://localhost:${config.port} [${config.env}]`);
    logger.info(`Health check: http://localhost:${config.port}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received – shutting down`);
    server.close(async () => {
      await db.destroy();
      logger.info('Database connections closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
