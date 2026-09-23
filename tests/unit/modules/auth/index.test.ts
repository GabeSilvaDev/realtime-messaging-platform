jest.mock('sequelize', () => {
  const actualSequelize = jest.requireActual('sequelize');
  return {
    ...actualSequelize,
    Model: class MockModel {
      static init = jest.fn();
      static findOne = jest.fn();
      static findByPk = jest.fn();
      static findAll = jest.fn();
      static create = jest.fn();
      static update = jest.fn();
      static destroy = jest.fn();
    },
  };
});

jest.mock('@/shared/database', () => ({
  sequelize: {
    models: {},
  },
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-token'),
  verify: jest.fn(() => ({ userId: 'test', email: 'test@test.com', username: 'test' })),
  decode: jest.fn(() => ({ userId: 'test' })),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn(() => Promise.resolve(true)),
}));

describe('modules/auth index', () => {
  it('deve exportar AuthService e authService', () => {
    const { AuthService, authService } = require('@/modules/auth');
    expect(AuthService).toBeDefined();
    expect(typeof AuthService).toBe('function');
    expect(authService).toBeDefined();
  });

  it('deve exportar TokenService e PasswordService', () => {
    const { TokenService, PasswordService } = require('@/modules/auth');
    expect(typeof TokenService).toBe('function');
    expect(typeof PasswordService).toBe('function');
  });

  it('deve exportar AuthController e authController', () => {
    const { AuthController, authController } = require('@/modules/auth');
    expect(typeof AuthController).toBe('function');
    expect(authController).toBeDefined();
  });

  it('deve exportar authRoutes', () => {
    const { authRoutes } = require('@/modules/auth');
    expect(authRoutes).toBeDefined();
    expect(typeof authRoutes).toBe('function');
  });

  it('deve exportar authenticate, optionalAuth e asyncHandler', () => {
    const { authenticate, optionalAuth, asyncHandler } = require('@/modules/auth');
    expect(typeof authenticate).toBe('function');
    expect(typeof optionalAuth).toBe('function');
    expect(typeof asyncHandler).toBe('function');
  });

  it('deve exportar as exceptions', () => {
    const {
      AuthException,
      InvalidCredentialsException,
      InvalidTokenException,
      UserNotFoundException,
      EmailAlreadyExistsException,
      UsernameAlreadyExistsException,
      InvalidPasswordException,
      SamePasswordException,
      UnauthorizedException,
      ValidationException,
    } = require('@/modules/auth');
    expect(new InvalidCredentialsException()).toBeInstanceOf(AuthException);
    expect(new InvalidTokenException()).toBeInstanceOf(AuthException);
    expect(new UserNotFoundException()).toBeInstanceOf(AuthException);
    expect(new EmailAlreadyExistsException()).toBeInstanceOf(AuthException);
    expect(new UsernameAlreadyExistsException()).toBeInstanceOf(AuthException);
    expect(new InvalidPasswordException()).toBeInstanceOf(AuthException);
    expect(new SamePasswordException()).toBeInstanceOf(AuthException);
    expect(new UnauthorizedException()).toBeInstanceOf(AuthException);
    expect(new ValidationException()).toBeInstanceOf(ValidationException);
  });

  it('deve exportar TokenType', () => {
    const { TokenType } = require('@/modules/auth');
    expect(TokenType).toBeDefined();
  });

  it('deve exportar os schemas de validação e seus tipos inferidos', () => {
    const {
      registerSchema,
      loginSchema,
      refreshTokenSchema,
      forgotPasswordSchema,
      resetPasswordSchema,
      changePasswordSchema,
    } = require('@/modules/auth');
    expect(registerSchema).toBeDefined();
    expect(loginSchema).toBeDefined();
    expect(refreshTokenSchema).toBeDefined();
    expect(forgotPasswordSchema).toBeDefined();
    expect(resetPasswordSchema).toBeDefined();
    expect(changePasswordSchema).toBeDefined();

    const parsed = loginSchema.safeParse({ email: 'user@test.com', password: 'Password1!' });
    expect(parsed.success).toBe(true);
  });

  it('deve exportar as constantes de reset de senha', () => {
    const { AUTH_CONSTANTS, PASSWORD_RESET_PREFIX, PASSWORD_RESET_TTL } = require('@/modules/auth');
    expect(AUTH_CONSTANTS).toBeDefined();
    expect(PASSWORD_RESET_PREFIX).toBe('password_reset:');
    expect(PASSWORD_RESET_TTL).toBe(3600);
  });
});
