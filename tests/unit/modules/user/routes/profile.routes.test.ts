jest.mock('@/modules/user/controllers', () => ({
  profileController: {
    getProfile: jest.fn(),
    getPublicProfile: jest.fn(),
    updateProfile: jest.fn(),
    updateDisplayName: jest.fn(),
    updateBio: jest.fn(),
    uploadAvatar: jest.fn(),
    removeAvatar: jest.fn(),
    updateStatus: jest.fn(),
    setOnline: jest.fn(),
    setOffline: jest.fn(),
    getProfileStats: jest.fn(),
    getProfileSettings: jest.fn(),
    updateProfileSettings: jest.fn(),
  },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: function authenticate(_req: unknown, _res: unknown, next: () => void): void {
    next();
  },
  asyncHandler: (fn: unknown): unknown => fn,
}));

import type { Request, Response, NextFunction, Router } from 'express';
import { profileRoutes } from '@/modules/user/routes/profile.routes';
import { profileController } from '@/modules/user/controllers';

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: Handler; name: string }[];
  };
}

type ControllerMethod = keyof typeof profileController;

const mockedController = profileController as jest.Mocked<typeof profileController>;

const getRoutes = (): NonNullable<RouteLayer['route']>[] =>
  ((profileRoutes as Router).stack as RouteLayer[])
    .map((layer) => layer.route)
    .filter((route): route is NonNullable<RouteLayer['route']> => route !== undefined);

const findRoute = (method: string, path: string): NonNullable<RouteLayer['route']> => {
  const route = getRoutes().find(
    (r) => r.path === path && r.methods[method.toLowerCase()] === true
  );
  if (route === undefined) {
    throw new Error(`Rota ${method} ${path} não encontrada`);
  }
  return route;
};

describe('profile.routes', () => {
  const routeTable: [string, string, ControllerMethod][] = [
    ['GET', '/', 'getProfile'],
    ['PUT', '/', 'updateProfile'],
    ['PATCH', '/', 'updateProfile'],
    ['PUT', '/display-name', 'updateDisplayName'],
    ['PUT', '/bio', 'updateBio'],
    ['POST', '/avatar', 'uploadAvatar'],
    ['DELETE', '/avatar', 'removeAvatar'],
    ['PUT', '/status', 'updateStatus'],
    ['POST', '/online', 'setOnline'],
    ['POST', '/offline', 'setOffline'],
    ['GET', '/stats', 'getProfileStats'],
    ['GET', '/settings', 'getProfileSettings'],
    ['PUT', '/settings', 'updateProfileSettings'],
    ['GET', '/:userId', 'getPublicProfile'],
  ];

  it('deve exportar uma instância de Router', () => {
    expect(typeof profileRoutes).toBe('function');
    expect(getRoutes()).toHaveLength(routeTable.length);
  });

  it('deve registrar GET /:userId como última rota', () => {
    const routes = getRoutes();
    const last = routes[routes.length - 1];

    expect(last?.path).toBe('/:userId');
    expect(last?.methods.get).toBe(true);
  });

  it.each(routeTable)(
    '%s %s deve exigir autenticação e delegar para profileController.%s',
    async (method, path, controllerMethod) => {
      const route = findRoute(method, path);
      const firstHandler = route.stack[0];
      const lastHandler = route.stack[route.stack.length - 1];
      const req = { params: {}, body: {} } as unknown as Request;
      const res = {} as Response;
      const next = jest.fn() as NextFunction;

      expect(firstHandler?.name).toBe('authenticate');

      await lastHandler?.handle(req, res, next);

      expect(mockedController[controllerMethod]).toHaveBeenCalledTimes(1);
      const expectedArgs: unknown[] =
        controllerMethod === 'uploadAvatar' ? [req, res, next] : [req, res];
      expect(mockedController[controllerMethod]).toHaveBeenCalledWith(...expectedArgs);
    }
  );

  it('POST /avatar deve incluir o middleware de upload (multer) entre auth e handler', () => {
    const route = findRoute('POST', '/avatar');

    expect(route.stack).toHaveLength(3);
    expect(route.stack[1]?.name).toBe('multerMiddleware');
  });
});
