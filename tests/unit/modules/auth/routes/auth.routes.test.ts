import { authRoutes } from '@/modules/auth/routes/auth.routes';
import { Router } from 'express';

jest.mock('@/modules/auth/controllers', () => ({
  authController: {
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
    me: jest.fn(),
    getSessions: jest.fn(),
    revokeSessions: jest.fn(),
  },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

describe('auth.routes', () => {
  it('should export a Router instance', () => {
    expect(authRoutes).toBeDefined();
    expect(typeof authRoutes).toBe('function');
  });

  it('should have routes defined', () => {
    const routes = (authRoutes as Router).stack;
    expect(routes.length).toBeGreaterThan(0);
  });

  describe('route definitions', () => {
    const getRoutePaths = (): { path: string; method: string }[] => {
      const stack = (authRoutes as Router).stack as Array<{
        route?: { path: string; methods: Record<string, boolean> };
      }>;
      return stack
        .filter((layer) => layer.route !== undefined)
        .map((layer) => ({
          path: layer.route!.path,
          method: Object.keys(layer.route!.methods)[0]?.toUpperCase() ?? '',
        }));
    };

    it('should have POST /register route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/register', method: 'POST' });
    });

    it('should have POST /login route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/login', method: 'POST' });
    });

    it('should have POST /logout route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/logout', method: 'POST' });
    });

    it('should have POST /refresh route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/refresh', method: 'POST' });
    });

    it('should have POST /forgot-password route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/forgot-password', method: 'POST' });
    });

    it('should have POST /reset-password route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/reset-password', method: 'POST' });
    });

    it('should have POST /change-password route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/change-password', method: 'POST' });
    });

    it('should have GET /me route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/me', method: 'GET' });
    });

    it('should have GET /sessions route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/sessions', method: 'GET' });
    });

    it('should have DELETE /sessions route', () => {
      const routes = getRoutePaths();
      expect(routes).toContainEqual({ path: '/sessions', method: 'DELETE' });
    });
  });
});
