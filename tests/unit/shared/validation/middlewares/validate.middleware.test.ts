import express, { Application } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { initLogger } from '@/shared/logger';
import { HttpStatus, ErrorCode } from '@/shared/errors';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import {
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  validate,
  validateWebSocketMessage,
  createValidationMiddleware,
} from '@/shared/validation/middlewares/validate.middleware';

describe('validate.middleware', () => {
  beforeAll(() => {
    // tests/setup.ts cria o singleton via Logger.getInstance, mas não chama initLogger;
    // sem isto getLogger() lança 'Logger not initialized'.
    initLogger({ service: 'test', environment: 'test', enableConsole: false, enableMongo: false });
  });

  // errorHandler precisa ser montado DEPOIS das rotas (é um middleware de 4 argumentos),
  // por isso não entra em um buildApp() genérico: cada teste monta sua(s) rota(s) e então
  // chama mountErrorHandler(app) antes de disparar a requisição.
  const buildApp = (): Application => {
    const app = express();
    // strict:false para permitir corpos JSON primitivos (ex.: `123`), usado no teste
    // que verifica o path vazio ("value") de formatZodErrors.
    app.use(express.json({ strict: false }));
    return app;
  };

  const mountErrorHandler = (app: Application): Application => {
    app.use(errorHandler);
    return app;
  };

  describe('validateRequest', () => {
    it('chama next() sem erro quando body, query e params são válidos', async () => {
      const app = buildApp();
      app.post(
        '/test/:id',
        validateRequest({
          body: z.object({ name: z.string() }),
          query: z.object({ page: z.string() }),
          params: z.object({ id: z.string() }),
        }),
        (req, res) => {
          res.json({ body: req.body, query: req.query, params: req.params });
        }
      );
      mountErrorHandler(app);

      const response = await request(app).post('/test/42?page=1').send({ name: 'ok' });

      expect(response.status).toBe(200);
      expect(response.body.body).toEqual({ name: 'ok' });
      expect(response.body.query).toEqual({ page: '1' });
      expect(response.body.params).toEqual({ id: '42' });
    });

    it('acumula erros de body e query e responde 422 com detalhes', async () => {
      const app = buildApp();
      app.post(
        '/test',
        validateRequest({
          body: z.object({ name: z.string().min(3) }),
          query: z.object({ page: z.string() }),
        }),
        (_req, res) => {
          res.json({ ok: true });
        }
      );
      mountErrorHandler(app);

      const response = await request(app).post('/test').send({ name: 'ab' });

      expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      const fields = response.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toContain('body.name');
      expect(fields).toContain('query.page');
    });

    it('responde 422 quando os params são inválidos', async () => {
      const app = buildApp();
      app.get(
        '/test/:id',
        validateRequest({ params: z.object({ id: z.string().uuid() }) }),
        (_req, res) => {
          res.json({ ok: true });
        }
      );
      mountErrorHandler(app);

      const response = await request(app).get('/test/not-a-uuid');

      expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.body.error.details[0].field).toBe('params.id');
    });

    it('valida headers convertendo as chaves para minúsculas', async () => {
      const app = buildApp();
      app.get(
        '/test',
        validateRequest({ headers: z.object({ 'x-custom': z.string() }) }),
        (_req, res) => {
          res.json({ ok: true });
        }
      );
      mountErrorHandler(app);

      const okResponse = await request(app).get('/test').set('X-Custom', 'valor');
      expect(okResponse.status).toBe(200);

      const failResponse = await request(app).get('/test');
      expect(failResponse.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(failResponse.body.error.details[0].field).toBe('headers.x-custom');
    });

    it('usa "unknown" como requestId quando o header x-request-id não é informado', async () => {
      const app = buildApp();
      app.post('/test', validateRequest({ body: z.object({ name: z.string() }) }), (_req, res) => {
        res.json({ ok: true });
      });
      mountErrorHandler(app);

      const response = await request(app).post('/test').send({});

      expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.body.error.requestId).toBe('unknown');
    });

    it('propaga o x-request-id recebido', async () => {
      const app = buildApp();
      app.post('/test', validateRequest({ body: z.object({ name: z.string() }) }), (_req, res) => {
        res.json({ ok: true });
      });
      mountErrorHandler(app);

      const response = await request(app).post('/test').set('x-request-id', 'req-abc').send({});

      expect(response.body.error.requestId).toBe('req-abc');
    });
  });

  describe('formatZodErrors (via validateRequest)', () => {
    const runBody = async (schema: z.ZodType, payload: unknown): Promise<request.Response> => {
      const app = buildApp();
      app.post('/test', validateRequest({ body: schema }), (_req, res) => {
        res.json({ ok: true });
      });
      mountErrorHandler(app);
      return request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(payload));
    };

    it('formata invalid_type incluindo o campo expected', async () => {
      const response = await runBody(z.object({ age: z.number() }), { age: 'not-a-number' });

      const detail = response.body.error.details[0];
      expect(detail.message).toContain('Esperado number');
    });

    it('formata too_small para origem string', async () => {
      const response = await runBody(z.object({ name: z.string().min(5) }), { name: 'ab' });
      expect(response.body.error.details[0].message).toBe('Deve ter pelo menos 5 caractere(s)');
    });

    it('formata too_small para origem number', async () => {
      const response = await runBody(z.object({ age: z.number().min(5) }), { age: 2 });
      expect(response.body.error.details[0].message).toBe('Deve ser maior ou igual a 5');
    });

    it('mantém a mensagem original do zod quando too_small não é string nem number', async () => {
      const response = await runBody(z.object({ tags: z.array(z.string()).min(2) }), {
        tags: ['a'],
      });
      expect(response.body.error.details[0].message).toBe(
        'Too small: expected array to have >=2 items'
      );
    });

    it('formata too_big para origem string', async () => {
      const response = await runBody(z.object({ name: z.string().max(3) }), { name: 'abcdef' });
      expect(response.body.error.details[0].message).toBe('Deve ter no máximo 3 caractere(s)');
    });

    it('formata too_big para origem number', async () => {
      const response = await runBody(z.object({ age: z.number().max(3) }), { age: 10 });
      expect(response.body.error.details[0].message).toBe('Deve ser menor ou igual a 3');
    });

    it('mantém a mensagem original do zod quando too_big não é string nem number', async () => {
      const response = await runBody(z.object({ tags: z.array(z.string()).max(1) }), {
        tags: ['a', 'b'],
      });
      expect(response.body.error.details[0].message).toBe(
        'Too big: expected array to have <=1 items'
      );
    });

    it('mantém a mensagem original do zod para outros códigos (ex.: formato inválido)', async () => {
      const response = await runBody(z.object({ email: z.string().email() }), {
        email: 'not-an-email',
      });
      expect(response.body.error.details[0].message).toBe('Invalid email address');
    });

    it('usa "value" como field quando o path do issue está vazio', async () => {
      const response = await runBody(z.string(), 123);
      expect(response.body.error.details[0].field).toBe('body.value');
    });

    it('converte elementos de path do tipo symbol para string', async () => {
      const sym = Symbol('campo-simbolico');
      const schema = z.object({ a: z.string() }).superRefine((_val, ctx) => {
        ctx.addIssue({ code: 'custom', message: 'erro custom', path: [sym] });
      });

      const response = await runBody(schema, { a: 'ok' });

      expect(response.body.error.details[0].field).toBe('body.Symbol(campo-simbolico)');
      expect(response.body.error.details[0].message).toBe('erro custom');
    });
  });

  describe('wrappers de conveniência', () => {
    it('validateBody delega para validateRequest apenas com body', async () => {
      const app = buildApp();
      app.post('/test', validateBody(z.object({ name: z.string() })), (req, res) => {
        res.json({ body: req.body });
      });
      mountErrorHandler(app);

      const response = await request(app).post('/test').send({ name: 'ok' });
      expect(response.status).toBe(200);
      expect(response.body.body).toEqual({ name: 'ok' });
    });

    it('validateQuery delega para validateRequest apenas com query', async () => {
      const app = buildApp();
      app.get('/test', validateQuery(z.object({ page: z.string() })), (req, res) => {
        res.json({ query: req.query });
      });
      mountErrorHandler(app);

      const response = await request(app).get('/test?page=1');
      expect(response.status).toBe(200);
      expect(response.body.query).toEqual({ page: '1' });
    });

    it('validateParams delega para validateRequest apenas com params', async () => {
      const app = buildApp();
      app.get('/test/:id', validateParams(z.object({ id: z.string() })), (_req, res) => {
        res.json({ ok: true });
      });
      mountErrorHandler(app);

      const response = await request(app).get('/test/7');
      expect(response.status).toBe(200);
    });

    it('validateHeaders delega para validateRequest apenas com headers', async () => {
      const app = buildApp();
      app.get('/test', validateHeaders(z.object({ 'x-custom': z.string() })), (_req, res) => {
        res.json({ ok: true });
      });
      mountErrorHandler(app);

      const response = await request(app).get('/test').set('x-custom', 'v');
      expect(response.status).toBe(200);
    });

    it('validate é um alias de validateRequest aceitando múltiplos schemas', async () => {
      const app = buildApp();
      app.post('/test', validate({ body: z.object({ name: z.string() }) }), (req, res) => {
        res.json({ body: req.body });
      });
      mountErrorHandler(app);

      const response = await request(app).post('/test').send({ name: 'ok' });
      expect(response.status).toBe(200);
    });

    it('createValidationMiddleware combina body, query e params', async () => {
      const app = buildApp();
      app.post(
        '/test/:id',
        createValidationMiddleware({
          body: z.object({ name: z.string() }),
          query: z.object({ page: z.string() }),
          params: z.object({ id: z.string() }),
        }),
        (req, res) => {
          res.json({ body: req.body, query: req.query, params: req.params });
        }
      );
      mountErrorHandler(app);

      const response = await request(app).post('/test/1?page=1').send({ name: 'ok' });
      expect(response.status).toBe(200);
      expect(response.body.query).toEqual({ page: '1' });
    });
  });

  describe('validateWebSocketMessage', () => {
    it('retorna success:true com os dados parseados quando válido', () => {
      const schema = z.object({ type: z.string() });
      const result = validateWebSocketMessage(schema, { type: 'ping' });
      expect(result).toEqual({ success: true, data: { type: 'ping' } });
    });

    it('retorna success:false com os erros formatados quando inválido', () => {
      const schema = z.object({ type: z.string() });
      const result = validateWebSocketMessage(schema, { type: 1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.field).toBe('type');
      }
    });
  });
});
