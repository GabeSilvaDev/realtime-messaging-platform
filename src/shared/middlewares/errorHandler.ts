import type { Request, Response, NextFunction } from 'express';
import { AppError, HttpStatus, ErrorCode } from '../errors';
import { getLogger, LogCategory } from '../logger';
import type { ErrorResponse } from '../interfaces';
import type { Environment } from '../types';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const logger = getLogger().child('ErrorHandler');
  logger.setCategory(LogCategory.HTTP);

  const requestId = String(req.headers['x-request-id'] ?? 'unknown');

  if (AppError.isAppError(err)) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        details: err.details,
        timestamp: err.timestamp.toISOString(),
        requestId,
      },
    };

    if (err.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      logger.error(`[${requestId}] ${err.message}`, err, {
        statusCode: err.statusCode,
        code: err.code,
        path: req.path,
        method: req.method,
      });
    } else {
      logger.warn(`[${requestId}] ${err.message}`, {
        statusCode: err.statusCode,
        code: err.code,
        path: req.path,
        method: req.method,
      });
    }

    res.status(err.statusCode).json(response);
    return;
  }

  logger.error(`[${requestId}] Unexpected error: ${err.message}`, err, {
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  const response: ErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: env === 'production' ? 'An unexpected error occurred' : err.message,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };

  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(response);
}

export default errorHandler;
