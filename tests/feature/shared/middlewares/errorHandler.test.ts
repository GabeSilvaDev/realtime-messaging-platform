import express, { Application, Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import request from 'supertest';
import { AppError, HttpStatus, ErrorCode } from '@/shared/errors';
import type { ErrorResponse } from '@/shared/interfaces';

describe('ErrorHandler Middleware', () => {
  let app: Application;

  const testErrorHandler: ErrorRequestHandler = (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
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

      res.status(err.statusCode).json(response);
      return;
    }

    const response: ErrorResponse = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: err.message,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(response);
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('errorHandler', () => {
    it('should handle AppError correctly', async () => {
      app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
        next(AppError.badRequest('Bad request test'));
      });
      app.use(testErrorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.BAD_REQUEST);
      expect(response.body.error.message).toBe('Bad request test');
    });

    it('should handle notFound AppError', async () => {
      app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
        next(AppError.notFound('User'));
      });
      app.use(testErrorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(response.body.error.message).toBe('User not found');
    });

    it('should handle generic Error as internal server error', async () => {
      app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
        next(new Error('Unexpected error'));
      });
      app.use(testErrorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should include requestId in response', async () => {
      app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
        next(AppError.badRequest('Test error'));
      });
      app.use(testErrorHandler);

      const response = await request(app)
        .get('/test')
        .set('x-request-id', 'test-request-id');

      expect(response.body.error.requestId).toBe('test-request-id');
    });

    it('should include timestamp in response', async () => {
      app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
        next(AppError.badRequest('Test error'));
      });
      app.use(testErrorHandler);

      const response = await request(app).get('/test');

      expect(response.body.error.timestamp).toBeDefined();
    });

    it('should handle conflict error', async () => {
      app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
        next(AppError.conflict('Resource already exists'));
      });
      app.use(testErrorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.error.code).toBe(ErrorCode.CONFLICT);
    });

    it('should handle service unavailable error', async () => {
      app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
        next(AppError.serviceUnavailable('Database'));
      });
      app.use(testErrorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(response.body.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    });
  });
});
