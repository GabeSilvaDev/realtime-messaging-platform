import type { Request, Response, NextFunction } from 'express';
import { AppError, HttpStatus, ErrorCode } from '../errors';
import { getLogger, LogCategory } from '../logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const logger = getLogger().child('NotFoundHandler');
  logger.setCategory(LogCategory.HTTP);

  const requestId = String(req.headers['x-request-id'] ?? 'unknown');

  logger.warn(`[${requestId}] Route not found: ${req.method} ${req.originalUrl}`, {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip ?? req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    requestId,
  });

  const error = new AppError(
    `Cannot ${req.method} ${req.path}`,
    HttpStatus.NOT_FOUND,
    ErrorCode.NOT_FOUND
  );

  next(error);
}

export default notFoundHandler;
