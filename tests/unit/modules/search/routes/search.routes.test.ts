jest.mock('@/modules/search/controllers/SearchController', () => ({
  searchController: { searchMessages: jest.fn() },
}));

// Funções simples (não jest.fn com implementação): resetMocks apagaria a implementação antes
// dos testes que montam rotas novas.
jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void): void => {
    next();
  },
  asyncHandler: (fn: unknown): unknown => fn,
}));

import express, { type Router } from 'express';
import request from 'supertest';
import type { Store } from 'express-rate-limit';
import { authenticate } from '@/modules/auth/middlewares';
import { searchController } from '@/modules/search/controllers/SearchController';
import { createSearchRateLimiter, createSearchRoutes, searchRoutes } from '@/modules/search/routes';
import { createRateLimiter } from '@/shared/middlewares/rateLimiter';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function routesOf(router: Router): Array<{ path: string; method: string; layer: Layer }> {
  return (router.stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

describe('search.routes', () => {
  it('define só GET /messages: authenticate → rate limit → controller', async () => {
    const routes = routesOf(searchRoutes as Router);

    expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual(['GET /messages']);
    const stack = routes[0]!.layer.route!.stack;
    expect(stack).toHaveLength(3);
    expect(stack[0]!.handle).toBe(authenticate);

    const req = {};
    const res = {};
    await stack[2]!.handle(req, res);
    expect(searchController.searchMessages).toHaveBeenCalledWith(req, res);
  });

  it('aceita controller e limiter injetados', async () => {
    const controller = { searchMessages: jest.fn() };
    const limiter = jest.fn();

    const stack = routesOf(createSearchRoutes(controller, limiter))[0]!.layer.route!.stack;
    await stack[2]!.handle('req', 'res');

    expect(stack[1]!.handle).toBe(limiter);
    expect(controller.searchMessages).toHaveBeenCalledWith('req', 'res');
  });

  it('rate limit próprio: 30 buscas por minuto por IP; a 31ª recebe 429 no formato do projeto', async () => {
    const controller = {
      searchMessages: async (_req: unknown, res: express.Response): Promise<void> => {
        res.status(200).json({ success: true });
      },
    };
    const app = express();
    app.use('/api/search', createSearchRoutes(controller, createSearchRateLimiter()));

    for (let i = 0; i < 30; i++) {
      const ok = await request(app).get('/api/search/messages?q=x');
      expect(ok.status).toBe(200);
    }
    const limited = await request(app).get('/api/search/messages?q=x');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many search requests, please try again later',
        statusCode: 429,
      },
    });
    expect(limited.headers['ratelimit-limit']).toBe('30');
  });

  it('quando o store falha, a requisição ainda chega ao controller (passOnStoreError: true)', async () => {
    const failingStore: Partial<Store> = {
      increment: jest.fn().mockRejectedValue(new Error('Redis outage')),
      decrement: jest.fn().mockResolvedValue(undefined),
      resetKey: jest.fn().mockResolvedValue(undefined),
    } as Partial<Store>;

    const controller = {
      searchMessages: async (_req: unknown, res: express.Response): Promise<void> => {
        res.status(200).json({ success: true, data: 'ok' });
      },
    };

    const app = express();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 30,
      keyPrefix: 'rl:search:',
      message: 'Too many search requests, please try again later',
      passOnStoreError: true,
      store: failingStore as Store,
    });

    app.use('/api/search', createSearchRoutes(controller, limiter));

    const response = await request(app).get('/api/search/messages?q=test');

    expect((failingStore.increment as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: 'ok' });
  });
});
