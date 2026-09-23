import rateLimit, {
  MemoryStore,
  type Options,
  type RateLimitRequestHandler,
  type Store,
} from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { redis } from '../database';
import { AppError, HttpStatus, ErrorCode } from '../errors';
import type { RateLimiterOptions } from '../interfaces';
import {
  RATE_LIMIT_DEFAULT_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX_REQUESTS,
  RATE_LIMIT_DEFAULT_KEY_PREFIX,
  RATE_LIMIT_STRICT_MAX_REQUESTS,
  RATE_LIMIT_STRICT_KEY_PREFIX,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX_REQUESTS,
  RATE_LIMIT_AUTH_KEY_PREFIX,
  RATE_LIMIT_LOGIN_KEY_PREFIX,
} from '../constants';

function createRedisStore(keyPrefix: string): Store {
  return new RedisStore({
    sendCommand: async (...args: string[]): Promise<number | string> => {
      const [command, ...commandArgs] = args;
      if (command === undefined || command === '') {
        throw new Error('Redis command is required');
      }
      const result = await redis.call(command, ...commandArgs);
      return result as number | string;
    },
    prefix: keyPrefix,
  });
}

function resolveStore(keyPrefix: string, store?: Store): Store {
  if (store !== undefined) {
    return store;
  }
  if (process.env.NODE_ENV === 'test') {
    return new MemoryStore();
  }
  return createRedisStore(keyPrefix);
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimitRequestHandler {
  const {
    windowMs = RATE_LIMIT_DEFAULT_WINDOW_MS,
    max = RATE_LIMIT_DEFAULT_MAX_REQUESTS,
    message = 'Too many requests, please try again later',
    keyPrefix = RATE_LIMIT_DEFAULT_KEY_PREFIX,
    skip,
    keyGenerator,
    skipSuccessfulRequests = false,
    store,
  } = options;

  const rateLimitOptions: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip,
    keyGenerator,
    validate: { xForwardedForHeader: false },
    handler: (req: Request, res: Response): void => {
      const requestId = String(req.headers['x-request-id'] ?? 'unknown');
      const error = new AppError(message, HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED);

      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          timestamp: error.timestamp.toISOString(),
          requestId,
        },
      });
    },
    store: resolveStore(keyPrefix, store),
  };

  return rateLimit(rateLimitOptions);
}

let _rateLimiter: RateLimitRequestHandler | null = null;
let _strictRateLimiter: RateLimitRequestHandler | null = null;
let _authRateLimiter: RateLimitRequestHandler | null = null;

export function getRateLimiter(): RateLimitRequestHandler {
  _rateLimiter ??= createRateLimiter();
  return _rateLimiter;
}

export function getStrictRateLimiter(): RateLimitRequestHandler {
  _strictRateLimiter ??= createRateLimiter({
    max: RATE_LIMIT_STRICT_MAX_REQUESTS,
    keyPrefix: RATE_LIMIT_STRICT_KEY_PREFIX,
    message: 'Too many attempts, please try again later',
  });
  return _strictRateLimiter;
}

export function getAuthRateLimiter(): RateLimitRequestHandler {
  _authRateLimiter ??= createRateLimiter({
    windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
    max: RATE_LIMIT_AUTH_MAX_REQUESTS,
    keyPrefix: RATE_LIMIT_AUTH_KEY_PREFIX,
    message: 'Too many authentication attempts, please try again later',
  });
  return _authRateLimiter;
}

let _loginRateLimiter: RateLimitRequestHandler | null = null;

export function getLoginRateLimiter(): RateLimitRequestHandler {
  _loginRateLimiter ??= createRateLimiter({
    windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
    max: RATE_LIMIT_AUTH_MAX_REQUESTS,
    keyPrefix: RATE_LIMIT_LOGIN_KEY_PREFIX,
    skipSuccessfulRequests: true,
    message: 'Too many failed login attempts, please try again later',
  });
  return _loginRateLimiter;
}

export { getRateLimiter as rateLimiter };
export { getStrictRateLimiter as strictRateLimiter };
export { getAuthRateLimiter as authRateLimiter };
export { getLoginRateLimiter as loginRateLimiter };

export default createRateLimiter;
