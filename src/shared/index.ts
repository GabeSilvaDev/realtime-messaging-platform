export type { Environment } from './types';

export type {
  Config,
  DatabaseConfig,
  RedisConfig,
  MongoConfig,
  ElasticsearchConfig,
  CorsConfig,
  RateLimiterOptions,
  SecurityConfig,
  RequestIdOptions,
  ErrorResponse,
  RequestLogMetadata,
} from './interfaces';

export {
  DEFAULT_PORT,
  POSTGRES_DEFAULTS,
  REDIS_DEFAULTS,
  MONGO_DEFAULTS,
  ELASTICSEARCH_DEFAULTS,
  POOL_CONFIG,
  MONGO_OPTIONS,
  CORS_DEFAULT_METHODS,
  CORS_DEFAULT_ALLOWED_HEADERS,
  CORS_DEFAULT_EXPOSED_HEADERS,
  CORS_DEFAULT_MAX_AGE,
  RATE_LIMIT_DEFAULT_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX_REQUESTS,
  RATE_LIMIT_DEFAULT_KEY_PREFIX,
  REQUEST_ID_DEFAULT_HEADER_NAME,
  HSTS_DEFAULT_MAX_AGE,
} from './constants';

export { default as config } from './config/database';

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

export {
  errorHandler,
  requestLogger,
  rateLimiter,
  strictRateLimiter,
  authRateLimiter,
  createRateLimiter,
  corsMiddleware,
  createCorsMiddleware,
  helmetMiddleware,
  createHelmetMiddleware,
  notFoundHandler,
  requestIdMiddleware,
  createRequestIdMiddleware,
} from './middlewares';
