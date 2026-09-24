import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import request from 'supertest';
import {
  CORS_DEFAULT_ALLOWED_HEADERS,
  CORS_DEFAULT_EXPOSED_HEADERS,
  CORS_DEFAULT_MAX_AGE,
  CORS_DEFAULT_METHODS,
} from '@/shared/constants';

const mockChildLogger = {
  setCategory: jest.fn(),
  warn: jest.fn(),
};

const mockLogger = {
  child: jest.fn(),
};

// getLogger é uma função simples (não jest.fn) para sobreviver ao resetMocks
// e às instâncias de módulo recriadas dentro de jest.isolateModules.
jest.mock('@/shared/logger', () => ({
  getLogger: () => mockLogger,
  LogCategory: { HTTP: 'http' },
}));

import createCorsMiddlewareDefault, {
  buildCorsOptions,
  corsMiddleware,
  createCorsMiddleware,
  getCorsMiddleware,
} from '@/shared/middlewares/cors';

type CorsModule = typeof import('@/shared/middlewares/cors');

const ORIGINAL_ENV = { ...process.env };

const loadIsolated = (env: Record<string, string | undefined>): CorsModule => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  let mod: CorsModule | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<CorsModule>('@/shared/middlewares/cors');
  });
  return mod as CorsModule;
};

const buildApp = (middleware: RequestHandler): express.Application => {
  const app = express();
  app.use(middleware);
  app.get('/test', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(403).json({ message: err.message });
  });
  return app;
};

describe('cors middleware', () => {
  beforeEach(() => {
    mockLogger.child.mockReturnValue(mockChildLogger);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('createCorsMiddleware (ambiente não produtivo)', () => {
    it('cria logger filho "CORS" com categoria HTTP', () => {
      createCorsMiddleware();

      expect(mockLogger.child).toHaveBeenCalledWith('CORS');
      expect(mockChildLogger.setCategory).toHaveBeenCalledWith('http');
    });

    it('permite qualquer origem por padrão ("*") e reflete a origem', async () => {
      const app = buildApp(createCorsMiddleware());

      const response = await request(app).get('/test').set('Origin', 'http://qualquer.com');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://qualquer.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-expose-headers']).toBe(
        CORS_DEFAULT_EXPOSED_HEADERS.join(',')
      );
    });

    it('permite requisições sem header Origin', async () => {
      const app = buildApp(createCorsMiddleware({ allowedOrigins: ['http://a.com'] }));

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('permite origem presente na lista (array)', async () => {
      const app = buildApp(
        createCorsMiddleware({ allowedOrigins: ['http://a.com', 'http://b.com'] })
      );

      const response = await request(app).get('/test').set('Origin', 'http://b.com');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://b.com');
    });

    it('permite origem configurada como string única', async () => {
      const app = buildApp(createCorsMiddleware({ allowedOrigins: 'http://a.com' }));

      const response = await request(app).get('/test').set('Origin', 'http://a.com');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://a.com');
    });

    it('bloqueia origem não permitida, loga warn e propaga erro', async () => {
      const app = buildApp(createCorsMiddleware({ allowedOrigins: 'http://a.com' }));

      const response = await request(app).get('/test').set('Origin', 'http://evil.com');

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not allowed by CORS');
      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        'CORS blocked request from origin: http://evil.com',
        { origin: 'http://evil.com', allowedOrigins: ['http://a.com'] }
      );
    });

    it('responde preflight com 204 e os defaults de métodos, headers e maxAge', async () => {
      const app = buildApp(createCorsMiddleware());

      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://a.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-methods']).toBe(CORS_DEFAULT_METHODS.join(','));
      expect(response.headers['access-control-allow-headers']).toBe(
        CORS_DEFAULT_ALLOWED_HEADERS.join(',')
      );
      expect(response.headers['access-control-max-age']).toBe(String(CORS_DEFAULT_MAX_AGE));
    });

    it('respeita configuração customizada completa', async () => {
      const app = buildApp(
        createCorsMiddleware({
          allowedOrigins: '*',
          methods: ['GET'],
          allowedHeaders: ['X-Custom'],
          exposedHeaders: ['X-Exposed'],
          credentials: false,
          maxAge: 60,
        })
      );

      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://a.com')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-methods']).toBe('GET');
      expect(response.headers['access-control-allow-headers']).toBe('X-Custom');
      expect(response.headers['access-control-max-age']).toBe('60');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  describe('buildCorsOptions (mesma política reusada pelo Socket.IO)', () => {
    it('devolve as opções do pacote cors usadas pelo middleware HTTP', () => {
      const options = buildCorsOptions({ allowedOrigins: ['http://a.com'] });

      expect(options).toEqual(
        expect.objectContaining({
          methods: CORS_DEFAULT_METHODS,
          allowedHeaders: CORS_DEFAULT_ALLOWED_HEADERS,
          exposedHeaders: CORS_DEFAULT_EXPOSED_HEADERS,
          credentials: true,
          maxAge: CORS_DEFAULT_MAX_AGE,
        })
      );
    });

    it('sem argumentos usa os padrões do projeto', () => {
      expect(buildCorsOptions()).toEqual(
        expect.objectContaining({ credentials: true, maxAge: CORS_DEFAULT_MAX_AGE })
      );
    });

    it('a função origin aplica a lista de origens permitidas', () => {
      const { origin } = buildCorsOptions({ allowedOrigins: ['http://a.com'] });
      const check = origin as (
        requestOrigin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void
      ) => void;
      const callback = jest.fn();

      check('http://a.com', callback);
      check('http://c.com', callback);

      expect(callback).toHaveBeenNthCalledWith(1, null, true);
      expect(callback).toHaveBeenNthCalledWith(2, expect.any(Error));
    });
  });

  describe('getCorsMiddleware / aliases', () => {
    it('retorna sempre a mesma instância (singleton)', () => {
      const first = getCorsMiddleware();
      const second = getCorsMiddleware();

      expect(first).toBe(second);
      expect(corsMiddleware).toBe(getCorsMiddleware);
    });

    it('export default é createCorsMiddleware', () => {
      expect(createCorsMiddlewareDefault).toBe(createCorsMiddleware);
    });
  });

  describe('ambiente de produção (módulo isolado)', () => {
    it('usa ALLOWED_ORIGINS separado por vírgula', async () => {
      const mod = loadIsolated({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'http://a.com,http://b.com',
      });
      const app = buildApp(mod.createCorsMiddleware());

      const allowed = await request(app).get('/test').set('Origin', 'http://b.com');
      const blocked = await request(app).get('/test').set('Origin', 'http://c.com');

      expect(allowed.status).toBe(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('http://b.com');
      expect(blocked.status).toBe(403);
    });

    it('bloqueia toda origem quando ALLOWED_ORIGINS não está definido', async () => {
      const mod = loadIsolated({ NODE_ENV: 'production', ALLOWED_ORIGINS: undefined });
      const app = buildApp(mod.createCorsMiddleware());

      const response = await request(app).get('/test').set('Origin', 'http://a.com');

      expect(response.status).toBe(403);
      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        'CORS blocked request from origin: http://a.com',
        { origin: 'http://a.com', allowedOrigins: [] }
      );
    });
  });

  describe('NODE_ENV ausente (módulo isolado)', () => {
    it('assume "development" e libera qualquer origem', async () => {
      const mod = loadIsolated({ NODE_ENV: undefined });
      const app = buildApp(mod.createCorsMiddleware());

      const response = await request(app).get('/test').set('Origin', 'http://x.com');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://x.com');
    });
  });
});
