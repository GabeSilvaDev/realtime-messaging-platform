import {
  DEFAULT_PORT,
  POSTGRES_DEFAULTS,
  REDIS_DEFAULTS,
  MONGO_DEFAULTS,
  ELASTICSEARCH_DEFAULTS,
  POOL_CONFIG,
  MONGO_OPTIONS,
  LOG_LEVEL_PRIORITY,
  LOG_RETENTION_DAYS,
  LOG_COLORS,
  RESET_COLOR,
  LOG_FLUSH_INTERVAL_MS,
  VALIDATION_ERROR_MESSAGES,
  DEFAULT_VALIDATION_ERROR_MESSAGE,
  DEFAULT_FIELD_NAME,
  CORS_DEFAULT_METHODS,
  CORS_DEFAULT_ALLOWED_HEADERS,
  CORS_DEFAULT_EXPOSED_HEADERS,
  CORS_DEFAULT_MAX_AGE,
  RATE_LIMIT_DEFAULT_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX_REQUESTS,
  RATE_LIMIT_DEFAULT_KEY_PREFIX,
  RATE_LIMIT_STRICT_MAX_REQUESTS,
  RATE_LIMIT_STRICT_KEY_PREFIX,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX_REQUESTS,
  RATE_LIMIT_AUTH_KEY_PREFIX,
  REQUEST_ID_DEFAULT_HEADER_NAME,
  HSTS_DEFAULT_MAX_AGE,
} from '@/shared/constants';

describe('Constants Index Exports', () => {
  describe('Database Constants', () => {
    it('should export DEFAULT_PORT', () => {
      expect(DEFAULT_PORT).toBe(3000);
    });

    it('should export POSTGRES_DEFAULTS', () => {
      expect(POSTGRES_DEFAULTS).toHaveProperty('HOST');
      expect(POSTGRES_DEFAULTS).toHaveProperty('PORT');
    });

    it('should export REDIS_DEFAULTS', () => {
      expect(REDIS_DEFAULTS).toHaveProperty('HOST');
      expect(REDIS_DEFAULTS).toHaveProperty('PORT');
    });

    it('should export MONGO_DEFAULTS', () => {
      expect(MONGO_DEFAULTS).toHaveProperty('HOST');
      expect(MONGO_DEFAULTS).toHaveProperty('PORT');
    });

    it('should export ELASTICSEARCH_DEFAULTS', () => {
      expect(ELASTICSEARCH_DEFAULTS).toHaveProperty('HOST');
      expect(ELASTICSEARCH_DEFAULTS).toHaveProperty('PORT');
    });

    it('should export POOL_CONFIG', () => {
      expect(POOL_CONFIG).toHaveProperty('development');
      expect(POOL_CONFIG).toHaveProperty('test');
      expect(POOL_CONFIG).toHaveProperty('production');
    });

    it('should export MONGO_OPTIONS', () => {
      expect(MONGO_OPTIONS).toHaveProperty('maxPoolSize');
    });
  });

  describe('Logger Constants', () => {
    it('should export LOG_LEVEL_PRIORITY', () => {
      expect(LOG_LEVEL_PRIORITY).toHaveProperty('debug');
      expect(LOG_LEVEL_PRIORITY).toHaveProperty('fatal');
    });

    it('should export LOG_RETENTION_DAYS', () => {
      expect(LOG_RETENTION_DAYS).toHaveProperty('debug');
      expect(LOG_RETENTION_DAYS).toHaveProperty('fatal');
    });

    it('should export LOG_COLORS', () => {
      expect(LOG_COLORS).toHaveProperty('debug');
      expect(LOG_COLORS).toHaveProperty('error');
    });

    it('should export RESET_COLOR', () => {
      expect(RESET_COLOR).toBe('\x1b[0m');
    });

    it('should export LOG_FLUSH_INTERVAL_MS', () => {
      expect(LOG_FLUSH_INTERVAL_MS).toBe(5000);
    });
  });

  describe('Validation Constants', () => {
    it('should export VALIDATION_ERROR_MESSAGES', () => {
      expect(VALIDATION_ERROR_MESSAGES).toHaveProperty('invalid_type');
    });

    it('should export DEFAULT_VALIDATION_ERROR_MESSAGE', () => {
      expect(DEFAULT_VALIDATION_ERROR_MESSAGE).toBe('Erro de validação');
    });

    it('should export DEFAULT_FIELD_NAME', () => {
      expect(DEFAULT_FIELD_NAME).toBe('value');
    });
  });

  describe('Middleware Constants', () => {
    it('should export CORS_DEFAULT_METHODS', () => {
      expect(Array.isArray(CORS_DEFAULT_METHODS)).toBe(true);
      expect(CORS_DEFAULT_METHODS).toContain('GET');
    });

    it('should export CORS_DEFAULT_ALLOWED_HEADERS', () => {
      expect(Array.isArray(CORS_DEFAULT_ALLOWED_HEADERS)).toBe(true);
    });

    it('should export CORS_DEFAULT_EXPOSED_HEADERS', () => {
      expect(Array.isArray(CORS_DEFAULT_EXPOSED_HEADERS)).toBe(true);
    });

    it('should export CORS_DEFAULT_MAX_AGE', () => {
      expect(CORS_DEFAULT_MAX_AGE).toBe(86400);
    });

    it('should export RATE_LIMIT_DEFAULT_WINDOW_MS', () => {
      expect(RATE_LIMIT_DEFAULT_WINDOW_MS).toBe(15 * 60 * 1000);
    });

    it('should export RATE_LIMIT_DEFAULT_MAX_REQUESTS', () => {
      expect(RATE_LIMIT_DEFAULT_MAX_REQUESTS).toBe(100);
    });

    it('should export RATE_LIMIT_DEFAULT_KEY_PREFIX', () => {
      expect(RATE_LIMIT_DEFAULT_KEY_PREFIX).toBe('rl:');
    });

    it('should export RATE_LIMIT_STRICT_MAX_REQUESTS', () => {
      expect(RATE_LIMIT_STRICT_MAX_REQUESTS).toBe(20);
    });

    it('should export RATE_LIMIT_STRICT_KEY_PREFIX', () => {
      expect(RATE_LIMIT_STRICT_KEY_PREFIX).toBe('rl:strict:');
    });

    it('should export RATE_LIMIT_AUTH_WINDOW_MS', () => {
      expect(RATE_LIMIT_AUTH_WINDOW_MS).toBe(60 * 1000);
    });

    it('should export RATE_LIMIT_AUTH_MAX_REQUESTS', () => {
      expect(RATE_LIMIT_AUTH_MAX_REQUESTS).toBe(5);
    });

    it('should export RATE_LIMIT_AUTH_KEY_PREFIX', () => {
      expect(RATE_LIMIT_AUTH_KEY_PREFIX).toBe('rl:auth:');
    });

    it('should export REQUEST_ID_DEFAULT_HEADER_NAME', () => {
      expect(REQUEST_ID_DEFAULT_HEADER_NAME).toBe('x-request-id');
    });

    it('should export HSTS_DEFAULT_MAX_AGE', () => {
      expect(HSTS_DEFAULT_MAX_AGE).toBe(31536000);
    });
  });
});
