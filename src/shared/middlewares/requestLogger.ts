import type { Request, Response, NextFunction } from 'express';
import { getLogger, LogCategory, LogLevel } from '../logger';
import type { RequestLogMetadata } from '../interfaces';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const logger = getLogger().child('RequestLogger');
  logger.setCategory(LogCategory.HTTP);

  const startTime = process.hrtime.bigint();
  const requestId = String(req.headers['x-request-id'] ?? 'unknown');

  const requestMetadata: RequestLogMetadata = {
    method: req.method,
    path: req.path,
    query: req.query as Record<string, unknown>,
    ip: req.ip ?? req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    requestId,
    contentLength: req.get('content-length'),
  };

  logger.info(`[${requestId}] --> ${req.method} ${req.originalUrl}`, requestMetadata);

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number(endTime - startTime) / 1_000_000;

    const responseMetadata: RequestLogMetadata = {
      ...requestMetadata,
      statusCode: res.statusCode,
      responseTime: Math.round(responseTimeMs * 100) / 100,
      contentType: res.get('content-type'),
    };

    const logLevel = getLogLevelByStatusCode(res.statusCode);
    const formattedTime = responseTimeMs.toFixed(2);
    const message = `[${requestId}] <-- ${req.method} ${req.originalUrl} ${String(res.statusCode)} ${formattedTime}ms`;

    switch (logLevel) {
      case LogLevel.ERROR:
        logger.error(message, undefined, responseMetadata);
        break;
      case LogLevel.WARN:
        logger.warn(message, responseMetadata);
        break;
      default:
        logger.info(message, responseMetadata);
    }
  });

  next();
}

function getLogLevelByStatusCode(statusCode: number): LogLevel {
  if (statusCode >= 500) {
    return LogLevel.ERROR;
  }
  if (statusCode >= 400) {
    return LogLevel.WARN;
  }
  return LogLevel.INFO;
}

export default requestLogger;
