jest.mock('@/modules/presence/controllers/PresenceController', () => ({
  presenceController: { getStates: jest.fn(), setStatus: jest.fn() },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

import type { Router } from 'express';
import { authenticate } from '@/modules/auth/middlewares';
import { presenceController } from '@/modules/presence/controllers/PresenceController';
import { presenceRoutes } from '@/modules/presence/routes';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function getRoutes(): Array<{ path: string; method: string; layer: Layer }> {
  return ((presenceRoutes as Router).stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

describe('presence.routes', () => {
  it('define GET / e PUT /status, ambos com authenticate', () => {
    expect(getRoutes().map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /',
      'PUT /status',
    ]);
    for (const { layer } of getRoutes()) {
      expect(layer.route!.stack[0]!.handle).toBe(authenticate);
    }
  });

  it.each([
    ['GET', '/', 'getStates'],
    ['PUT', '/status', 'setStatus'],
  ] as const)('%s %s deve chamar presenceController.%s', async (method, path, handler) => {
    const route = getRoutes().find((r) => r.method === method && r.path === path)!;
    const req = {};
    const res = {};

    await route.layer.route!.stack[1]!.handle(req, res);

    expect(presenceController[handler]).toHaveBeenCalledWith(req, res);
  });
});
