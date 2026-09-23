import { AuthController, authController } from '@/modules/auth/controllers';

describe('auth/controllers index', () => {
  it('deve exportar AuthController', () => {
    expect(AuthController).toBeDefined();
    expect(typeof AuthController).toBe('function');
  });

  it('deve exportar authController instance', () => {
    expect(authController).toBeDefined();
    expect(authController).toBeInstanceOf(AuthController);
  });
});
