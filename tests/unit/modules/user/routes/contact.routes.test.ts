jest.mock('@/modules/user/controllers/ContactController', () => ({
  contactController: {
    list: jest.fn(),
    add: jest.fn(),
    listFavorites: jest.fn(),
    online: jest.fn(),
    stats: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

import type { Router } from 'express';
import { contactRoutes } from '@/modules/user/routes/contact.routes';
import { contactController } from '@/modules/user/controllers/ContactController';
import { authenticate } from '@/modules/auth/middlewares';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function getRoutes(): Array<{ path: string; method: string; layer: Layer }> {
  return ((contactRoutes as Router).stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

describe('contact.routes', () => {
  it.each([
    ['GET', '/'],
    ['POST', '/'],
    ['GET', '/favorites'],
    ['GET', '/online'],
    ['GET', '/stats'],
    ['GET', '/:contactId'],
    ['PATCH', '/:contactId'],
    ['DELETE', '/:contactId'],
  ])('deve definir %s %s', (method, path) => {
    expect(getRoutes().map(({ method: m, path: p }) => ({ method: m, path: p }))).toContainEqual({
      method,
      path,
    });
  });

  it('deve declarar rotas estáticas antes de /:contactId', () => {
    const paths = getRoutes().map((r) => r.path);
    const firstParam = paths.indexOf('/:contactId');
    expect(paths.indexOf('/favorites')).toBeLessThan(firstParam);
    expect(paths.indexOf('/stats')).toBeLessThan(firstParam);
    expect(paths.indexOf('/online')).toBeLessThan(firstParam);
  });

  it('deve proteger todas as rotas com authenticate', () => {
    for (const { layer } of getRoutes()) {
      expect(layer.route!.stack[0]!.handle).toBe(authenticate);
    }
  });

  it.each([
    ['GET', '/', 'list'],
    ['POST', '/', 'add'],
    ['GET', '/favorites', 'listFavorites'],
    ['GET', '/online', 'online'],
    ['GET', '/stats', 'stats'],
    ['GET', '/:contactId', 'get'],
    ['PATCH', '/:contactId', 'update'],
    ['DELETE', '/:contactId', 'remove'],
  ] as const)('%s %s deve chamar contactController.%s', async (method, path, handler) => {
    const route = getRoutes().find((r) => r.method === method && r.path === path)!;
    const handle = route.layer.route!.stack[1]!.handle;
    const req = {};
    const res = {};

    await handle(req, res);

    expect(contactController[handler]).toHaveBeenCalledWith(req, res);
  });
});
