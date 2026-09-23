import express, { type Request, type RequestHandler } from 'express';
import request from 'supertest';
import { REQUEST_ID_DEFAULT_HEADER_NAME } from '@/shared/constants';
import createRequestIdMiddlewareDefault, {
  createRequestIdMiddleware,
  getRequestIdMiddleware,
  requestIdMiddleware,
} from '@/shared/middlewares/requestId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const buildApp = (middleware: RequestHandler, headerName = REQUEST_ID_DEFAULT_HEADER_NAME) => {
  const app = express();
  app.use(middleware);
  app.get('/test', (req: Request, res) => {
    res.json({ id: req.id, headerValue: req.headers[headerName] ?? null });
  });
  return app;
};

describe('requestId middleware', () => {
  describe('createRequestIdMiddleware com defaults', () => {
    it('gera um UUID v4 quando o header não é enviado', async () => {
      const app = buildApp(createRequestIdMiddleware());

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.body.id).toMatch(UUID_V4);
      expect(response.body.headerValue).toBe(response.body.id);
      expect(response.headers[REQUEST_ID_DEFAULT_HEADER_NAME]).toBe(response.body.id);
    });

    it('reaproveita o id recebido no header sem gerar outro', async () => {
      const app = buildApp(createRequestIdMiddleware());

      const response = await request(app)
        .get('/test')
        .set(REQUEST_ID_DEFAULT_HEADER_NAME, 'existing-id-123');

      expect(response.body.id).toBe('existing-id-123');
      expect(response.body.headerValue).toBe('existing-id-123');
      expect(response.headers[REQUEST_ID_DEFAULT_HEADER_NAME]).toBe('existing-id-123');
    });
  });

  describe('createRequestIdMiddleware com opções', () => {
    it('usa o generator customizado', async () => {
      const generator = jest.fn().mockReturnValue('custom-id');
      const app = buildApp(createRequestIdMiddleware({ generator }));

      const response = await request(app).get('/test');

      expect(generator).toHaveBeenCalledTimes(1);
      expect(response.body.id).toBe('custom-id');
    });

    it('não chama o generator quando o id já existe', async () => {
      const generator = jest.fn().mockReturnValue('custom-id');
      const app = buildApp(createRequestIdMiddleware({ generator }));

      await request(app).get('/test').set(REQUEST_ID_DEFAULT_HEADER_NAME, 'abc');

      expect(generator).not.toHaveBeenCalled();
    });

    it('usa o headerName customizado para leitura, req.headers e resposta', async () => {
      const headerName = 'x-correlation-id';
      const app = buildApp(
        createRequestIdMiddleware({ headerName, generator: () => 'gen-id' }),
        headerName
      );

      const generated = await request(app).get('/test');
      const provided = await request(app).get('/test').set(headerName, 'from-client');

      expect(generated.body.id).toBe('gen-id');
      expect(generated.body.headerValue).toBe('gen-id');
      expect(generated.headers[headerName]).toBe('gen-id');
      expect(generated.headers[REQUEST_ID_DEFAULT_HEADER_NAME]).toBeUndefined();
      expect(provided.body.id).toBe('from-client');
    });

    it('não define o header de resposta quando setResponseHeader=false', async () => {
      const app = buildApp(createRequestIdMiddleware({ setResponseHeader: false }));

      const response = await request(app).get('/test');

      expect(response.body.id).toMatch(UUID_V4);
      expect(response.headers[REQUEST_ID_DEFAULT_HEADER_NAME]).toBeUndefined();
    });
  });

  describe('getRequestIdMiddleware / aliases', () => {
    it('retorna sempre a mesma instância (singleton)', () => {
      const first = getRequestIdMiddleware();
      const second = getRequestIdMiddleware();

      expect(first).toBe(second);
      expect(requestIdMiddleware).toBe(getRequestIdMiddleware);
    });

    it('a instância singleton funciona como middleware', async () => {
      const app = buildApp(getRequestIdMiddleware());

      const response = await request(app).get('/test');

      expect(response.body.id).toMatch(UUID_V4);
    });

    it('export default é createRequestIdMiddleware', () => {
      expect(createRequestIdMiddlewareDefault).toBe(createRequestIdMiddleware);
    });
  });
});
