export const CORS_DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
export const CORS_DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Request-ID',
  'X-Requested-With',
  'Accept',
  'Origin',
];
export const CORS_DEFAULT_EXPOSED_HEADERS = [
  'X-Request-ID',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
];
export const CORS_DEFAULT_MAX_AGE = 86400;

export const RATE_LIMIT_DEFAULT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_DEFAULT_MAX_REQUESTS = 100;
export const RATE_LIMIT_DEFAULT_KEY_PREFIX = 'rl:';
export const RATE_LIMIT_STRICT_MAX_REQUESTS = 20;
export const RATE_LIMIT_STRICT_KEY_PREFIX = 'rl:strict:';
export const RATE_LIMIT_AUTH_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_AUTH_MAX_REQUESTS = 5;
export const RATE_LIMIT_AUTH_KEY_PREFIX = 'rl:auth:';

export const REQUEST_ID_DEFAULT_HEADER_NAME = 'x-request-id';

export const HSTS_DEFAULT_MAX_AGE = 31536000;
