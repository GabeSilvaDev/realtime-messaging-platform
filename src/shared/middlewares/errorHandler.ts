import type { Request, Response, NextFunction } from 'express';
import { AppError, HttpStatus, ErrorCode } from '../errors';
import { getLogger, LogCategory } from '../logger';
import type { ErrorResponse } from '../interfaces';
import type { Environment } from '../types';
import type { Logger } from '../logger';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';

function tryGetLogger(): Logger | null {
  try {
    return getLogger();
  } catch {
    return null;
  }
}

function logError(
  requestId: string,
  err: Error,
  req: Request,
  statusCode: number,
  code?: string
): void {
  const logger = tryGetLogger();
  if (logger === null) {
    return;
  }

  const childLogger = logger.child('ErrorHandler');
  childLogger.setCategory(LogCategory.HTTP);

  if (statusCode >= 500) {
    childLogger.error(`[${requestId}] ${err.message}`, err, {
      statusCode,
      code,
      path: req.path,
      method: req.method,
    });
  } else {
    childLogger.warn(`[${requestId}] ${err.message}`, {
      statusCode,
      code,
      path: req.path,
      method: req.method,
    });
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
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

    logError(requestId, err, req, err.statusCode, err.code);
    res.status(err.statusCode).json(response);
    return;
  }

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

  logError(requestId, err, req, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR);
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(response);
}

export default errorHandler;
