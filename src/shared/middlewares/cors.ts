import cors, { type CorsOptions } from 'cors';
import type { RequestHandler } from 'express';
import { getLogger, LogCategory } from '../logger';
import type { CorsConfig } from '../interfaces';
import type { Environment } from '../types';
import {
  CORS_DEFAULT_METHODS,
  CORS_DEFAULT_ALLOWED_HEADERS,
  CORS_DEFAULT_EXPOSED_HEADERS,
  CORS_DEFAULT_MAX_AGE,
} from '../constants';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';
const isProduction = env === 'production';

export function createCorsMiddleware(config: CorsConfig = {}): RequestHandler {
  const logger = getLogger().child('CORS');
  logger.setCategory(LogCategory.HTTP);

  const {
    allowedOrigins = isProduction ? (process.env.ALLOWED_ORIGINS?.split(',') ?? []) : '*',
    methods = CORS_DEFAULT_METHODS,
    allowedHeaders = CORS_DEFAULT_ALLOWED_HEADERS,
    exposedHeaders = CORS_DEFAULT_EXPOSED_HEADERS,
    credentials = true,
    maxAge = CORS_DEFAULT_MAX_AGE,
  } = config;

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      if (origin === undefined) {
        callback(null, true);
        return;
      }

      if (allowedOrigins === '*') {
        callback(null, true);
        return;
      }

      const origins = Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins];
      if (origins.includes(origin)) {
        callback(null, true);
        return;
      }

      logger.warn(`CORS blocked request from origin: ${origin}`, {
        origin,
        allowedOrigins: origins,
      });
      callback(new Error('Not allowed by CORS'));
    },
    methods,
    allowedHeaders,
    exposedHeaders,
    credentials,
    maxAge,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };

  return cors(corsOptions);
}

export const corsMiddleware = createCorsMiddleware();

export default corsMiddleware;
