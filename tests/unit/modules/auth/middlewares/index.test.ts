import { authenticate, optionalAuth, asyncHandler } from '@/modules/auth/middlewares';

describe('auth/middlewares index', () => {
  it('deve exportar authenticate', () => {
    expect(authenticate).toBeDefined();
    expect(typeof authenticate).toBe('function');
  });

  it('deve exportar optionalAuth', () => {
    expect(optionalAuth).toBeDefined();
    expect(typeof optionalAuth).toBe('function');
  });

  it('deve exportar asyncHandler', () => {
    expect(asyncHandler).toBeDefined();
    expect(typeof asyncHandler).toBe('function');
  });
});
