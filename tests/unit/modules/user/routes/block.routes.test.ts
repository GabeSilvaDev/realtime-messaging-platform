jest.mock('@/modules/user/controllers/BlockController', () => ({
  blockController: {
    list: jest.fn(),
    block: jest.fn(),
    unblock: jest.fn(),
  },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

import type { Router } from 'express';
import { blockRoutes } from '@/modules/user/routes/block.routes';
import { blockController } from '@/modules/user/controllers/BlockController';
import { authenticate } from '@/modules/auth/middlewares';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function getRoutes(): Array<{ path: string; method: string; layer: Layer }> {
  return ((blockRoutes as Router).stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

describe('block.routes', () => {
  it.each([
    ['GET', '/', 'list'],
    ['POST', '/', 'block'],
    ['DELETE', '/:userId', 'unblock'],
  ] as const)(
    '%s %s deve chamar blockController.%s com authenticate',
    async (method, path, handler) => {
      const route = getRoutes().find((r) => r.method === method && r.path === path);
      expect(route).toBeDefined();
      expect(route!.layer.route!.stack[0]!.handle).toBe(authenticate);

      const req = {};
      const res = {};
      await route!.layer.route!.stack[1]!.handle(req, res);

      expect(blockController[handler]).toHaveBeenCalledWith(req, res);
    }
  );
});
