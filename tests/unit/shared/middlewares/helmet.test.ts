import express, { type RequestHandler } from 'express';
import request from 'supertest';
import createHelmetMiddlewareDefault, {
  createHelmetMiddleware,
  getHelmetMiddleware,
  helmetMiddleware,
} from '@/shared/middlewares/helmet';
import { HSTS_DEFAULT_MAX_AGE } from '@/shared/constants';

type HelmetModule = typeof import('@/shared/middlewares/helmet');

const ORIGINAL_ENV = { ...process.env };

const loadIsolated = (nodeEnv: string | undefined): HelmetModule => {
  if (nodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = nodeEnv;
  }

  let mod: HelmetModule | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<HelmetModule>('@/shared/middlewares/helmet');
  });
  return mod as HelmetModule;
};

const getHeaders = async (middleware: RequestHandler): Promise<Record<string, string>> => {
  const app = express();
  app.use(middleware);
  app.get('/test', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const response = await request(app).get('/test');
  expect(response.status).toBe(200);
  return response.headers as Record<string, string>;
};

describe('helmet middleware', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('createHelmetMiddleware com defaults (NODE_ENV=test)', () => {
    it('aplica os headers padrão sem CSP e sem HSTS', async () => {
      const headers = await getHeaders(createHelmetMiddleware());

      expect(headers['content-security-policy']).toBeUndefined();
      expect(headers['strict-transport-security']).toBeUndefined();
      expect(headers['cross-origin-embedder-policy']).toBeUndefined();
      expect(headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(headers['x-dns-prefetch-control']).toBe('off');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-download-options']).toBe('noopen');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['origin-agent-cluster']).toBe('?1');
      expect(headers['x-permitted-cross-domain-policies']).toBe('none');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['x-xss-protection']).toBe('0');
    });
  });

  describe('createHelmetMiddleware com configuração customizada', () => {
    it('usa os valores informados no lugar dos defaults', async () => {
      const headers = await getHeaders(
        createHelmetMiddleware({
          contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
          crossOriginEmbedderPolicy: { policy: 'require-corp' },
          crossOriginOpenerPolicy: { policy: 'unsafe-none' },
          crossOriginResourcePolicy: { policy: 'cross-origin' },
          dnsPrefetchControl: { allow: true },
          frameguard: { action: 'sameorigin' },
          hsts: { maxAge: 123, includeSubDomains: false, preload: false },
          ieNoOpen: false,
          noSniff: false,
          originAgentCluster: false,
          permittedCrossDomainPolicies: { permittedPolicies: 'master-only' },
          referrerPolicy: { policy: 'no-referrer' },
          xssFilter: false,
        })
      );

      expect(headers['content-security-policy']).toContain("default-src 'none'");
      expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
      expect(headers['cross-origin-opener-policy']).toBe('unsafe-none');
      expect(headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(headers['x-dns-prefetch-control']).toBe('on');
      expect(headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(headers['strict-transport-security']).toBe('max-age=123');
      expect(headers['x-download-options']).toBeUndefined();
      expect(headers['x-content-type-options']).toBeUndefined();
      expect(headers['origin-agent-cluster']).toBeUndefined();
      expect(headers['x-permitted-cross-domain-policies']).toBe('master-only');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['x-xss-protection']).toBeUndefined();
    });
  });

  describe('getHelmetMiddleware / aliases', () => {
    it('retorna sempre a mesma instância (singleton)', () => {
      const first = getHelmetMiddleware();
      const second = getHelmetMiddleware();

      expect(first).toBe(second);
      expect(helmetMiddleware).toBe(getHelmetMiddleware);
    });

    it('export default é createHelmetMiddleware', () => {
      expect(createHelmetMiddlewareDefault).toBe(createHelmetMiddleware);
    });
  });

  describe('ambiente de produção (módulo isolado)', () => {
    it('habilita CSP padrão e HSTS com preload', async () => {
      const mod = loadIsolated('production');

      const headers = await getHeaders(mod.createHelmetMiddleware());

      const csp = headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("connect-src 'self' wss: ws:");
      expect(csp).toContain('upgrade-insecure-requests');
      expect(headers['strict-transport-security']).toBe(
        `max-age=${String(HSTS_DEFAULT_MAX_AGE)}; includeSubDomains; preload`
      );
    });
  });

  describe('NODE_ENV ausente (módulo isolado)', () => {
    it('assume "development" (sem CSP e sem HSTS)', async () => {
      const mod = loadIsolated(undefined);

      const headers = await getHeaders(mod.createHelmetMiddleware());

      expect(headers['content-security-policy']).toBeUndefined();
      expect(headers['strict-transport-security']).toBeUndefined();
    });
  });
});
