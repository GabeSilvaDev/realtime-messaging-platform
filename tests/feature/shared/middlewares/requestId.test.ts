import express, { Application, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { REQUEST_ID_DEFAULT_HEADER_NAME } from '@/shared/constants';

describe('RequestId Middleware', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
  });

  describe('custom requestId middleware', () => {
    const createTestRequestIdMiddleware = (
      options: {
        headerName?: string;
        generator?: () => string;
        setResponseHeader?: boolean;
      } = {}
    ) => {
      const {
        headerName = REQUEST_ID_DEFAULT_HEADER_NAME,
        generator = () => `test-id-${Date.now()}`,
        setResponseHeader = true,
      } = options;

      return (req: Request & { id?: string }, res: Response, next: NextFunction) => {
        const existingId = req.get(headerName);
        const requestId = existingId ?? generator();

        req.id = requestId;

        if (!existingId) {
          req.headers[headerName] = requestId;
        }

        if (setResponseHeader) {
          res.setHeader(headerName, requestId);
        }

        next();
      };
    };

    it('should generate a request id when not provided', async () => {
      app.use(createTestRequestIdMiddleware());
      app.get('/test', (req: Request & { id?: string }, res) => {
        res.json({ requestId: req.id });
      });

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.body.requestId).toBeDefined();
      expect(response.headers[REQUEST_ID_DEFAULT_HEADER_NAME]).toBeDefined();
    });

    it('should use existing request id from header', async () => {
      const existingId = 'existing-request-id-123';
      app.use(createTestRequestIdMiddleware());
      app.get('/test', (req: Request & { id?: string }, res) => {
        res.json({ requestId: req.id });
      });

      const response = await request(app)
        .get('/test')
        .set(REQUEST_ID_DEFAULT_HEADER_NAME, existingId);

      expect(response.status).toBe(200);
      expect(response.body.requestId).toBe(existingId);
    });

    it('should set response header with request id', async () => {
      app.use(createTestRequestIdMiddleware({ setResponseHeader: true }));
      app.get('/test', (_req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');

      expect(response.headers[REQUEST_ID_DEFAULT_HEADER_NAME]).toBeDefined();
    });

    it('should not set response header when disabled', async () => {
      app.use(createTestRequestIdMiddleware({ setResponseHeader: false }));
      app.get('/test', (_req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');

      expect(response.headers[REQUEST_ID_DEFAULT_HEADER_NAME]).toBeUndefined();
    });

    it('should use custom header name', async () => {
      const customHeader = 'x-custom-request-id';
      app.use(createTestRequestIdMiddleware({ headerName: customHeader }));
      app.get('/test', (req: Request & { id?: string }, res) => {
        res.json({ requestId: req.id });
      });

      const response = await request(app).get('/test');

      expect(response.headers[customHeader]).toBeDefined();
    });

    it('should use custom generator', async () => {
      const customId = 'custom-generated-id';
      app.use(createTestRequestIdMiddleware({ generator: () => customId }));
      app.get('/test', (req: Request & { id?: string }, res) => {
        res.json({ requestId: req.id });
      });

      const response = await request(app).get('/test');

      expect(response.body.requestId).toBe(customId);
    });
  });
});
