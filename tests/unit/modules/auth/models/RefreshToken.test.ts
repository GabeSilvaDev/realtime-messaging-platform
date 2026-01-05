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
    DataTypes: actualSequelize.DataTypes,
  };
});

jest.mock('@/shared/database', () => ({
  sequelize: {
    define: jest.fn(),
    models: {},
  },
}));

import { RefreshToken } from '@/modules/auth/models/RefreshToken';

describe('RefreshToken Model', () => {
  describe('isExpired', () => {
    it('should return true when token is expired', () => {
      const token = new RefreshToken();
      token.expiresAt = new Date('2020-01-01');

      expect(token.isExpired()).toBe(true);
    });

    it('should return false when token is not expired', () => {
      const token = new RefreshToken();
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      token.expiresAt = futureDate;

      expect(token.isExpired()).toBe(false);
    });

    it('should return true when expiresAt is exactly now (boundary)', () => {
      const token = new RefreshToken();
      const now = new Date();
      token.expiresAt = new Date(now.getTime() - 1);

      expect(token.isExpired()).toBe(true);
    });
  });

  describe('isValid', () => {
    it('should return true when token is not revoked and not expired', () => {
      const token = new RefreshToken();
      token.isRevoked = false;
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      token.expiresAt = futureDate;

      expect(token.isValid()).toBe(true);
    });

    it('should return false when token is revoked', () => {
      const token = new RefreshToken();
      token.isRevoked = true;
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      token.expiresAt = futureDate;

      expect(token.isValid()).toBe(false);
    });

    it('should return false when token is expired', () => {
      const token = new RefreshToken();
      token.isRevoked = false;
      token.expiresAt = new Date('2020-01-01');

      expect(token.isValid()).toBe(false);
    });

    it('should return false when token is both revoked and expired', () => {
      const token = new RefreshToken();
      token.isRevoked = true;
      token.expiresAt = new Date('2020-01-01');

      expect(token.isValid()).toBe(false);
    });
  });

  describe('model attributes', () => {
    it('should have all required attributes', () => {
      const token = new RefreshToken();
      token.id = 'token-id';
      token.userId = 'user-123';
      token.token = 'jwt-token';
      token.expiresAt = new Date('2026-01-10');
      token.isRevoked = false;
      token.revokedAt = null;
      token.userAgent = 'Mozilla/5.0';
      token.ipAddress = '192.168.1.1';
      token.createdAt = new Date();
      token.updatedAt = new Date();

      expect(token.id).toBe('token-id');
      expect(token.userId).toBe('user-123');
      expect(token.token).toBe('jwt-token');
      expect(token.expiresAt).toEqual(new Date('2026-01-10'));
      expect(token.isRevoked).toBe(false);
      expect(token.revokedAt).toBeNull();
      expect(token.userAgent).toBe('Mozilla/5.0');
      expect(token.ipAddress).toBe('192.168.1.1');
      expect(token.createdAt).toBeInstanceOf(Date);
      expect(token.updatedAt).toBeInstanceOf(Date);
    });
  });
});
