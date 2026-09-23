import express, { Application } from 'express';
import request from 'supertest';
import { initLogger } from '@/shared/logger';
import { notFoundHandler } from '@/shared/middlewares/notFound';
import { errorHandler } from '@/shared/middlewares/errorHandler';

describe('NotFound Middleware', () => {
  let app: Application;

  beforeAll(() => {
    // tests/setup.ts cria o singleton via Logger.getInstance, mas não chama initLogger;
    // sem isto getLogger() lança 'Logger not initialized'.
    initLogger({ service: 'test', environment: 'test', enableConsole: false, enableMongo: false });
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('notFoundHandler', () => {
    it('should return 404 for unknown routes', async () => {
      app.get('/existing', (_req, res) => {
        res.json({ success: true });
      });
      app.use(notFoundHandler);
      app.use(errorHandler);

      const response = await request(app).get('/non-existing-route');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should include method and path in error message', async () => {
      app.use(notFoundHandler);
      app.use(errorHandler);

      const response = await request(app).post('/api/unknown');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain('POST');
      expect(response.body.error.message).toContain('/api/unknown');
    });

    it('should not affect existing routes', async () => {
      app.get('/existing', (_req, res) => {
        res.json({ success: true, data: 'test' });
      });
      app.use(notFoundHandler);
      app.use(errorHandler);

      const response = await request(app).get('/existing');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
