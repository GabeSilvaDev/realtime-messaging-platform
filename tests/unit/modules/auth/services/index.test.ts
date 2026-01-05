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

describe('Auth Services Index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export PasswordService class', () => {
    const { PasswordService } = require('@/modules/auth/services');
    expect(PasswordService).toBeDefined();
    expect(typeof PasswordService).toBe('function');
  });

  it('should export passwordService instance', () => {
    const { passwordService } = require('@/modules/auth/services');
    expect(passwordService).toBeDefined();
  });

  it('should export TokenService class', () => {
    const { TokenService } = require('@/modules/auth/services');
    expect(TokenService).toBeDefined();
    expect(typeof TokenService).toBe('function');
  });

  it('should export tokenService instance', () => {
    const { tokenService } = require('@/modules/auth/services');
    expect(tokenService).toBeDefined();
  });

  it('should export AuthService class', () => {
    const { AuthService } = require('@/modules/auth/services');
    expect(AuthService).toBeDefined();
    expect(typeof AuthService).toBe('function');
  });

  it('should export authService instance', () => {
    const { authService } = require('@/modules/auth/services');
    expect(authService).toBeDefined();
  });
});
