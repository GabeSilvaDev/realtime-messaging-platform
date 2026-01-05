import { RefreshTokenRepository } from '@/modules/auth/repositories/RefreshTokenRepository';
import { RefreshToken } from '@/modules/auth/models/RefreshToken';

jest.mock('@/modules/auth/models/RefreshToken');

const MockRefreshToken = RefreshToken as jest.Mocked<typeof RefreshToken>;

describe('RefreshTokenRepository', () => {
  let repository: RefreshTokenRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new RefreshTokenRepository();
  });

  describe('create', () => {
    it('should create a new refresh token', async () => {
      const tokenData = {
        userId: 'user-123',
        token: 'refresh-token-abc',
        expiresAt: new Date('2026-01-05'),
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
      };

      const mockCreatedToken = {
        id: 'token-id-1',
        ...tokenData,
        isRevoked: false,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as RefreshToken;

      MockRefreshToken.create.mockResolvedValue(mockCreatedToken);

      const result = await repository.create(tokenData);

      expect(MockRefreshToken.create).toHaveBeenCalledWith(tokenData);
      expect(result).toEqual(mockCreatedToken);
    });

    it('should create token without optional fields', async () => {
      const tokenData = {
        userId: 'user-123',
        token: 'refresh-token-abc',
        expiresAt: new Date('2026-01-05'),
      };

      const mockCreatedToken = {
        id: 'token-id-1',
        ...tokenData,
        userAgent: null,
        ipAddress: null,
        isRevoked: false,
        revokedAt: null,
      } as unknown as RefreshToken;

      MockRefreshToken.create.mockResolvedValue(mockCreatedToken);

      const result = await repository.create(tokenData);

      expect(MockRefreshToken.create).toHaveBeenCalledWith(tokenData);
      expect(result).toEqual(mockCreatedToken);
    });
  });

  describe('findByToken', () => {
    it('should find a non-revoked token by token string', async () => {
      const mockToken = {
        id: 'token-id-1',
        token: 'refresh-token-abc',
        userId: 'user-123',
        isRevoked: false,
      } as unknown as RefreshToken;

      MockRefreshToken.findOne.mockResolvedValue(mockToken);

      const result = await repository.findByToken('refresh-token-abc');

      expect(MockRefreshToken.findOne).toHaveBeenCalledWith({
        where: { token: 'refresh-token-abc', isRevoked: false },
      });
      expect(result).toEqual(mockToken);
    });

    it('should return null when token not found', async () => {
      MockRefreshToken.findOne.mockResolvedValue(null);

      const result = await repository.findByToken('non-existent-token');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find a token by id', async () => {
      const mockToken = {
        id: 'token-id-1',
        token: 'refresh-token-abc',
        userId: 'user-123',
      } as unknown as RefreshToken;

      MockRefreshToken.findByPk.mockResolvedValue(mockToken);

      const result = await repository.findById('token-id-1');

      expect(MockRefreshToken.findByPk).toHaveBeenCalledWith('token-id-1');
      expect(result).toEqual(mockToken);
    });

    it('should return null when id not found', async () => {
      MockRefreshToken.findByPk.mockResolvedValue(null);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findActiveByUserId', () => {
    it('should find all active tokens for a user', async () => {
      const mockTokens = [
        { id: 'token-1', userId: 'user-123', isRevoked: false },
        { id: 'token-2', userId: 'user-123', isRevoked: false },
      ] as unknown as RefreshToken[];

      MockRefreshToken.findAll.mockResolvedValue(mockTokens);

      const result = await repository.findActiveByUserId('user-123');

      expect(MockRefreshToken.findAll).toHaveBeenCalledWith({
        where: { userId: 'user-123', isRevoked: false },
      });
      expect(result).toHaveLength(2);
      expect(result).toEqual(mockTokens);
    });

    it('should return empty array when no active tokens', async () => {
      MockRefreshToken.findAll.mockResolvedValue([]);

      const result = await repository.findActiveByUserId('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('revoke', () => {
    it('should revoke a token instance', async () => {
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockToken = {
        id: 'token-id-1',
        isRevoked: false,
        revokedAt: null,
        save: mockSave,
      } as unknown as RefreshToken;

      await repository.revoke(mockToken);

      expect(mockToken.isRevoked).toBe(true);
      expect(mockToken.revokedAt).toBeInstanceOf(Date);
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('revokeByToken', () => {
    it('should revoke token by token string and return true', async () => {
      MockRefreshToken.update.mockResolvedValue([1]);

      const result = await repository.revokeByToken('refresh-token-abc');

      expect(MockRefreshToken.update).toHaveBeenCalledWith(
        { isRevoked: true, revokedAt: expect.any(Date) },
        { where: { token: 'refresh-token-abc', isRevoked: false } }
      );
      expect(result).toBe(true);
    });

    it('should return false when token not found', async () => {
      MockRefreshToken.update.mockResolvedValue([0]);

      const result = await repository.revokeByToken('non-existent-token');

      expect(result).toBe(false);
    });
  });

  describe('revokeAllForUser', () => {
    it('should revoke all tokens for a user', async () => {
      MockRefreshToken.update.mockResolvedValue([3]);

      const result = await repository.revokeAllForUser('user-123');

      expect(MockRefreshToken.update).toHaveBeenCalledWith(
        { isRevoked: true, revokedAt: expect.any(Date) },
        { where: { userId: 'user-123', isRevoked: false } }
      );
      expect(result).toBe(3);
    });

    it('should return 0 when no tokens to revoke', async () => {
      MockRefreshToken.update.mockResolvedValue([0]);

      const result = await repository.revokeAllForUser('user-without-tokens');

      expect(result).toBe(0);
    });
  });

  describe('revokeAllExcept', () => {
    it('should revoke all tokens except the current one', async () => {
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockTokens = [
        { id: 'token-1', isRevoked: false, revokedAt: null, save: mockSave },
        { id: 'current-token', isRevoked: false, revokedAt: null, save: mockSave },
        { id: 'token-3', isRevoked: false, revokedAt: null, save: mockSave },
      ] as unknown as RefreshToken[];

      MockRefreshToken.findAll.mockResolvedValue(mockTokens);

      const result = await repository.revokeAllExcept('user-123', 'current-token');

      expect(MockRefreshToken.findAll).toHaveBeenCalledWith({
        where: { userId: 'user-123', isRevoked: false },
      });
      expect(result).toBe(2);
      expect(mockSave).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when only current token exists', async () => {
      const mockTokens = [
        { id: 'current-token', isRevoked: false, revokedAt: null, save: jest.fn() },
      ] as unknown as RefreshToken[];

      MockRefreshToken.findAll.mockResolvedValue(mockTokens);

      const result = await repository.revokeAllExcept('user-123', 'current-token');

      expect(result).toBe(0);
    });

    it('should return 0 when no tokens exist', async () => {
      MockRefreshToken.findAll.mockResolvedValue([]);

      const result = await repository.revokeAllExcept('user-123', 'current-token');

      expect(result).toBe(0);
    });
  });

  describe('deleteExpired', () => {
    it('should delete expired tokens', async () => {
      MockRefreshToken.destroy.mockResolvedValue(5);

      const result = await repository.deleteExpired();

      expect(MockRefreshToken.destroy).toHaveBeenCalledWith({
        where: {
          expiresAt: { $lt: expect.any(Date) },
        },
      });
      expect(result).toBe(5);
    });

    it('should return 0 when no expired tokens', async () => {
      MockRefreshToken.destroy.mockResolvedValue(0);

      const result = await repository.deleteExpired();

      expect(result).toBe(0);
    });
  });
});
