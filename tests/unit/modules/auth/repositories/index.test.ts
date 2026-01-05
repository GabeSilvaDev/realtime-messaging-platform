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
    models: {
      User: {
        findByPk: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    },
  },
}));

describe('Auth Repositories Index', () => {
  it('should export RefreshTokenRepository class', () => {
    const { RefreshTokenRepository } = require('@/modules/auth/repositories');
    expect(RefreshTokenRepository).toBeDefined();
    expect(typeof RefreshTokenRepository).toBe('function');
  });

  it('should export refreshTokenRepository instance', () => {
    const { refreshTokenRepository } = require('@/modules/auth/repositories');
    expect(refreshTokenRepository).toBeDefined();
  });

  it('should export UserRepository class', () => {
    const { UserRepository } = require('@/modules/auth/repositories');
    expect(UserRepository).toBeDefined();
    expect(typeof UserRepository).toBe('function');
  });

  it('should export userRepository instance', () => {
    const { userRepository } = require('@/modules/auth/repositories');
    expect(userRepository).toBeDefined();
  });
});
