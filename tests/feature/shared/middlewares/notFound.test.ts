import express, { Application, Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import request from 'supertest';
import { AppError, HttpStatus, ErrorCode } from '@/shared/errors';
import type { ErrorResponse } from '@/shared/interfaces';

describe('NotFound Middleware', () => {
  let app: Application;

  const testNotFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
    const error = new AppError(
      `Cannot ${req.method} ${req.path}`,
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND
    );
    next(error);
  };

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
          timestamp: err.timestamp.toISOString(),
          requestId,
        },
      };

      res.status(err.statusCode).json(response);
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: err.message,
      },
    });
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('notFoundHandler', () => {
    it('should return 404 for unknown routes', async () => {
      app.get('/existing', (_req, res) => {
        res.json({ success: true });
      });
      app.use(testNotFoundHandler);
      app.use(testErrorHandler);

      const response = await request(app).get('/non-existing-route');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should include method and path in error message', async () => {
      app.use(testNotFoundHandler);
      app.use(testErrorHandler);

      const response = await request(app).post('/api/unknown');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain('POST');
      expect(response.body.error.message).toContain('/api/unknown');
    });

    it('should not affect existing routes', async () => {
      app.get('/existing', (_req, res) => {
        res.json({ success: true, data: 'test' });
      });
      app.use(testNotFoundHandler);
      app.use(testErrorHandler);

      const response = await request(app).get('/existing');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
