// Types
export type { Environment } from './types';

// Interfaces
export type {
  Config,
  DatabaseConfig,
  RedisConfig,
  MongoConfig,
  ElasticsearchConfig,
} from './interfaces';

// Constants
export {
  DEFAULT_PORT,
  POSTGRES_DEFAULTS,
  REDIS_DEFAULTS,
  MONGO_DEFAULTS,
  ELASTICSEARCH_DEFAULTS,
  POOL_CONFIG,
  MONGO_OPTIONS,
} from './constants';

// Config
export { default as config } from './config/database';

// Database connections
export {
  sequelize,
  connectPostgres,
  disconnectPostgres,
  redis,
  connectRedis,
  disconnectRedis,
  mongoose,
  connectMongo,
  disconnectMongo,
  elasticsearch,
  connectElasticsearch,
  disconnectElasticsearch,
} from './database';

export {
  AppError,
  HttpStatus,
  ErrorCode,
  ValidationError,
  UnauthorizedError,
  AuthErrorReason,
} from './errors';
export type { ErrorDetails, FieldError } from './errors';

export { Logger, initLogger, getLogger, LogLevel, LogCategory, LogModel } from './logger';
export type { ILogger, LogEntry, LogMetadata, LoggerOptions } from './logger';
