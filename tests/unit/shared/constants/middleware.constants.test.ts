import {
  CORS_DEFAULT_METHODS,
  CORS_DEFAULT_ALLOWED_HEADERS,
  CORS_DEFAULT_EXPOSED_HEADERS,
  CORS_DEFAULT_MAX_AGE,
  RATE_LIMIT_DEFAULT_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX_REQUESTS,
  RATE_LIMIT_DEFAULT_KEY_PREFIX,
  REQUEST_ID_DEFAULT_HEADER_NAME,
  HSTS_DEFAULT_MAX_AGE,
} from '@/shared/constants/middleware.constants';

describe('Middleware Constants', () => {
  describe('CORS Constants', () => {
    it('should have default methods', () => {
      expect(CORS_DEFAULT_METHODS).toContain('GET');
      expect(CORS_DEFAULT_METHODS).toContain('POST');
      expect(CORS_DEFAULT_METHODS).toContain('PUT');
      expect(CORS_DEFAULT_METHODS).toContain('DELETE');
    });

    it('should have default allowed headers', () => {
      expect(CORS_DEFAULT_ALLOWED_HEADERS).toContain('Content-Type');
      expect(CORS_DEFAULT_ALLOWED_HEADERS).toContain('Authorization');
    });

    it('should have default exposed headers', () => {
      expect(CORS_DEFAULT_EXPOSED_HEADERS).toContain('X-Request-ID');
    });

    it('should have max age of 24 hours', () => {
      expect(CORS_DEFAULT_MAX_AGE).toBe(86400);
    });
  });

  describe('Rate Limit Constants', () => {
    it('should have default window of 15 minutes', () => {
      expect(RATE_LIMIT_DEFAULT_WINDOW_MS).toBe(15 * 60 * 1000);
    });

    it('should have default max requests of 100', () => {
      expect(RATE_LIMIT_DEFAULT_MAX_REQUESTS).toBe(100);
    });

    it('should have default key prefix', () => {
      expect(RATE_LIMIT_DEFAULT_KEY_PREFIX).toBe('rl:');
    });
  });

  describe('Request ID Constants', () => {
    it('should have default header name', () => {
      expect(REQUEST_ID_DEFAULT_HEADER_NAME).toBe('x-request-id');
    });
  });

  describe('HSTS Constants', () => {
    it('should have max age of 1 year', () => {
      expect(HSTS_DEFAULT_MAX_AGE).toBe(31536000);
    });
  });
});
