import rateLimit, { type RateLimitRequestHandler, type Options } from 'express-rate-limit';
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
} from '../constants';

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimitRequestHandler {
  const {
    windowMs = RATE_LIMIT_DEFAULT_WINDOW_MS,
    max = RATE_LIMIT_DEFAULT_MAX_REQUESTS,
    message = 'Too many requests, please try again later',
    keyPrefix = RATE_LIMIT_DEFAULT_KEY_PREFIX,
    skip,
    keyGenerator,
  } = options;

  const rateLimitOptions: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    keyGenerator:
      keyGenerator ?? ((req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown'),
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
    store: new RedisStore({
      sendCommand: async (...args: string[]): Promise<number | string> => {
        const [command, ...commandArgs] = args;
        if (command === undefined || command === '') {
          throw new Error('Redis command is required');
        }
        const result = await redis.call(command, ...commandArgs);
        return result as number | string;
      },
      prefix: keyPrefix,
    }),
  };

  return rateLimit(rateLimitOptions);
}

export const rateLimiter = createRateLimiter();

export const strictRateLimiter = createRateLimiter({
  max: RATE_LIMIT_STRICT_MAX_REQUESTS,
  keyPrefix: RATE_LIMIT_STRICT_KEY_PREFIX,
  message: 'Too many attempts, please try again later',
});

export const authRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
  max: RATE_LIMIT_AUTH_MAX_REQUESTS,
  keyPrefix: RATE_LIMIT_AUTH_KEY_PREFIX,
  message: 'Too many authentication attempts, please try again in a minute',
});

export default rateLimiter;
