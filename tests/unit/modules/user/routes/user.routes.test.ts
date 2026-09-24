jest.mock('@/modules/user/controllers/UserController', () => ({
  userController: { search: jest.fn() },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

import type { Router } from 'express';
import { userRoutes } from '@/modules/user/routes/user.routes';
import { userController } from '@/modules/user/controllers/UserController';
import { authenticate } from '@/modules/auth/middlewares';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

describe('user.routes', () => {
  it('GET /search deve chamar userController.search com authenticate', async () => {
    const layer = ((userRoutes as Router).stack as Layer[]).find(
      (l) => l.route?.path === '/search' && l.route.methods.get === true
    );
    expect(layer).toBeDefined();
    expect(layer!.route!.stack[0]!.handle).toBe(authenticate);

    const req = {};
    const res = {};
    await layer!.route!.stack[1]!.handle(req, res);

    expect(userController.search).toHaveBeenCalledWith(req, res);
  });
});
