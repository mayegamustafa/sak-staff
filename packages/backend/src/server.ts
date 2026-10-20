import app from './app';
import db from './db';
import { config } from './config';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';

async function start() {
  // Ensure upload and log directories exist
  fs.mkdirSync(path.resolve(config.upload.dir), { recursive: true });
  if (config.log.toFile) fs.mkdirSync(path.resolve(config.log.dir), { recursive: true });

  // Test DB connection
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection established');
  } catch (err) {
    logger.error('Failed to connect to database:', err);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    logger.info(`SAK Staffing API running on http://localhost:${config.port} [${config.env}]`);
    logger.info(`Health check: http://localhost:${config.port}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received – shutting down`);
    // Don't hang forever on keep-alive connections; platforms SIGKILL after ~10-30s.
    setTimeout(() => { logger.warn('Forcing shutdown'); process.exit(1); }, 10_000).unref();
    server.close(async () => {
      await db.destroy();
      logger.info('Database connections closed');
      process.exit(0);
    });
  };

  // Slow-loris protection: bound how long a client may take to send a request.
  server.headersTimeout = 30_000;
  server.requestTimeout = 5 * 60_000; // large uploads on slow school connections

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});

start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
