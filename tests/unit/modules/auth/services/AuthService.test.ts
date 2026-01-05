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

jest.mock('@/modules/auth/repositories/RefreshTokenRepository', () => ({
  RefreshTokenRepository: jest.fn(),
  refreshTokenRepository: {
    create: jest.fn(),
    findByToken: jest.fn(),
    findById: jest.fn(),
    findActiveByUserId: jest.fn(),
    revoke: jest.fn(),
    revokeByToken: jest.fn(),
    revokeAllForUser: jest.fn(),
    revokeAllExcept: jest.fn(),
    deleteExpired: jest.fn(),
  },
}));

jest.mock('@/modules/auth/repositories/UserRepository', () => ({
  UserRepository: jest.fn(),
  userRepository: {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    create: jest.fn(),
    updatePassword: jest.fn(),
  },
}));

jest.mock('@/modules/auth/events/AuthEvents', () => ({
  AuthEvents: jest.fn().mockImplementation(() => ({
    emitRegister: jest.fn(),
    emitLogin: jest.fn(),
    emitLoginFailed: jest.fn(),
    emitLogout: jest.fn(),
    emitTokenRefresh: jest.fn(),
    emitPasswordResetRequest: jest.fn(),
    emitPasswordReset: jest.fn(),
    emitPasswordChange: jest.fn(),
  })),
}));

import { AuthService } from '@/modules/auth/services/AuthService';
import type { TokenService } from '@/modules/auth/services/TokenService';
import type { PasswordService } from '@/modules/auth/services/PasswordService';
import type { IUserRepository } from '@/modules/auth/interfaces';
import type { RefreshTokenRepository } from '@/modules/auth/repositories/RefreshTokenRepository';
import type { AuthEvents } from '@/modules/auth/events/AuthEvents';
import { redis } from '@/shared/database';
import { PASSWORD_RESET_PREFIX } from '@/modules/auth/constants/auth.constants';
import { UserStatus } from '@/shared/types';

const mockRedis = redis as jest.Mocked<typeof redis>;

describe('AuthService', () => {
  let authService: AuthService;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockPasswordService: jest.Mocked<PasswordService>;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockRefreshTokenRepository: jest.Mocked<RefreshTokenRepository>;
  let mockAuthEvents: jest.Mocked<AuthEvents>;

  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword123',
    displayName: 'Test User',
    avatarUrl: null,
    status: UserStatus.OFFLINE,
    lastSeenAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockTokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTokenService = {
      generateAccessToken: jest.fn(),
      generateRefreshToken: jest.fn(),
      generateTokenPair: jest.fn().mockReturnValue(mockTokenPair),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      decodeToken: jest.fn(),
      extractFromHeader: jest.fn(),
      getRefreshExpiration: jest.fn().mockReturnValue(new Date('2026-01-10')),
    } as unknown as jest.Mocked<TokenService>;

    mockPasswordService = {
      hash: jest.fn().mockResolvedValue('hashedpassword'),
      compare: jest.fn(),
      generateResetToken: jest.fn().mockReturnValue({ token: 'reset-token', hash: 'reset-hash' }),
      hashToken: jest.fn().mockReturnValue('hashed-reset-token'),
      verifyResetToken: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;

    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn(),
    };

    mockRefreshTokenRepository = {
      create: jest.fn(),
      findByToken: jest.fn(),
      findById: jest.fn(),
      findActiveByUserId: jest.fn(),
      revoke: jest.fn(),
      revokeByToken: jest.fn(),
      revokeAllForUser: jest.fn(),
      revokeAllExcept: jest.fn(),
      deleteExpired: jest.fn(),
    } as unknown as jest.Mocked<RefreshTokenRepository>;

    mockAuthEvents = {
      emitRegister: jest.fn(),
      emitLogin: jest.fn(),
      emitLoginFailed: jest.fn(),
      emitLogout: jest.fn(),
      emitTokenRefresh: jest.fn(),
      emitPasswordResetRequest: jest.fn(),
      emitPasswordReset: jest.fn(),
      emitPasswordChange: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    } as unknown as jest.Mocked<AuthEvents>;

    authService = new AuthService(
      mockTokenService,
      mockPasswordService,
      mockUserRepository,
      mockRefreshTokenRepository,
      mockAuthEvents
    );
  });

  describe('register', () => {
    const registerData = {
      username: 'newuser',
      email: 'new@example.com',
      password: 'Password123!',
      displayName: 'New User',
    };

    it('should register a new user successfully', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue({
        id: 'new-user-id',
        ...registerData,
        password: 'hashedpassword',
        avatarUrl: null,
        status: UserStatus.OFFLINE,
        lastSeenAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });

      const result = await authService.register(registerData);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(registerData.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(registerData.username);
      expect(mockPasswordService.hash).toHaveBeenCalledWith(registerData.password);
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(mockAuthEvents.emitRegister).toHaveBeenCalled();
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(registerData.email);
    });

    it('should throw error when email already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockUserRepository.findByUsername.mockResolvedValue(null);

      await expect(authService.register(registerData)).rejects.toThrow('Email já cadastrado');
    });

    it('should throw error when username already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(mockUser);

      await expect(authService.register(registerData)).rejects.toThrow('Username já em uso');
    });

    it('should register with auth context', async () => {
      const ctx = { userId: '', ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0' };

      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue({
        id: 'new-user-id',
        ...registerData,
        password: 'hashedpassword',
        avatarUrl: null,
        status: UserStatus.OFFLINE,
        lastSeenAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });

      await authService.register(registerData, ctx);

      expect(mockRefreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: ctx.userAgent,
          ipAddress: ctx.ipAddress,
        })
      );
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login successfully with valid credentials', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordService.compare.mockResolvedValue(true);

      const result = await authService.login(loginData);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(loginData.email);
      expect(mockPasswordService.compare).toHaveBeenCalledWith(
        loginData.password,
        mockUser.password
      );
      expect(mockAuthEvents.emitLogin).toHaveBeenCalledWith(mockUser.id, mockUser.email);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(authService.login(loginData)).rejects.toThrow('Credenciais inválidas');
      expect(mockAuthEvents.emitLoginFailed).toHaveBeenCalledWith(
        loginData.email,
        'User not found'
      );
    });

    it('should throw error when password is invalid', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordService.compare.mockResolvedValue(false);

      await expect(authService.login(loginData)).rejects.toThrow('Credenciais inválidas');
      expect(mockAuthEvents.emitLoginFailed).toHaveBeenCalledWith(
        loginData.email,
        'Invalid password'
      );
    });

    it('should login with auth context', async () => {
      const ctx = { userId: '', ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0' };

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordService.compare.mockResolvedValue(true);

      await authService.login(loginData, ctx);

      expect(mockRefreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: ctx.userAgent,
          ipAddress: ctx.ipAddress,
        })
      );
    });
  });

  describe('logout', () => {
    it('should logout and revoke token', async () => {
      const mockStoredToken = {
        id: 'token-id',
        userId: 'user-123',
        token: 'refresh-token',
        isRevoked: false,
      };

      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockStoredToken as never);

      await authService.logout('refresh-token');

      expect(mockRefreshTokenRepository.findByToken).toHaveBeenCalledWith('refresh-token');
      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith(mockStoredToken);
      expect(mockAuthEvents.emitLogout).toHaveBeenCalledWith('user-123');
    });

    it('should do nothing when token not found', async () => {
      mockRefreshTokenRepository.findByToken.mockResolvedValue(null);

      await authService.logout('non-existent-token');

      expect(mockRefreshTokenRepository.revoke).not.toHaveBeenCalled();
      expect(mockAuthEvents.emitLogout).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const mockDecodedToken = {
      userId: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    };

    it('should refresh tokens successfully', async () => {
      const mockStoredToken = {
        id: 'token-id',
        userId: 'user-123',
        isValid: jest.fn().mockReturnValue(true),
      };

      mockTokenService.verifyRefreshToken.mockReturnValue(mockDecodedToken as never);
      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockStoredToken as never);
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await authService.refresh('valid-refresh-token');

      expect(mockTokenService.verifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith(mockStoredToken);
      expect(result).toHaveProperty('tokens');
    });

    it('should throw error when stored token is invalid', async () => {
      const mockStoredToken = {
        id: 'token-id',
        userId: 'user-123',
        isValid: jest.fn().mockReturnValue(false),
      };

      mockTokenService.verifyRefreshToken.mockReturnValue(mockDecodedToken as never);
      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockStoredToken as never);

      await expect(authService.refresh('invalid-refresh-token')).rejects.toThrow(
        'Token inválido ou expirado'
      );
    });

    it('should throw error when stored token not found', async () => {
      mockTokenService.verifyRefreshToken.mockReturnValue(mockDecodedToken as never);
      mockRefreshTokenRepository.findByToken.mockResolvedValue(null);

      await expect(authService.refresh('non-existent-token')).rejects.toThrow(
        'Token inválido ou expirado'
      );
    });

    it('should throw error when user not found', async () => {
      const mockStoredToken = {
        id: 'token-id',
        userId: 'user-123',
        isValid: jest.fn().mockReturnValue(true),
      };

      mockTokenService.verifyRefreshToken.mockReturnValue(mockDecodedToken as never);
      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockStoredToken as never);
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(authService.refresh('valid-refresh-token')).rejects.toThrow(
        'Usuário não encontrado'
      );
      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith(mockStoredToken);
    });
  });

  describe('forgotPassword', () => {
    it('should generate reset token for existing user', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockRedis.set.mockResolvedValue('OK');

      const result = await authService.forgotPassword('test@example.com');

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockPasswordService.generateResetToken).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        `${PASSWORD_RESET_PREFIX}reset-hash`,
        mockUser.id,
        'EX',
        expect.any(Number)
      );
      expect(mockAuthEvents.emitPasswordResetRequest).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.email
      );
      expect(result).toHaveProperty('token', 'reset-token');
    });

    it('should return empty token for non-existent user', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await authService.forgotPassword('nonexistent@example.com');

      expect(result).toEqual({ token: '' });
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const resetData = {
      token: 'reset-token',
      newPassword: 'NewPassword123!',
    };

    it('should reset password successfully', async () => {
      mockRedis.get.mockResolvedValue('user-123');
      mockRedis.del.mockResolvedValue(1);

      await authService.resetPassword(resetData);

      expect(mockPasswordService.hashToken).toHaveBeenCalledWith(resetData.token);
      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockPasswordService.hash).toHaveBeenCalledWith(resetData.newPassword);
      expect(mockUserRepository.updatePassword).toHaveBeenCalledWith('user-123', 'hashedpassword');
      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockRefreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('user-123');
      expect(mockAuthEvents.emitPasswordReset).toHaveBeenCalledWith('user-123');
    });

    it('should throw error for invalid or expired token', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(authService.resetPassword(resetData)).rejects.toThrow(
        'Token inválido ou expirado'
      );
    });
  });

  describe('changePassword', () => {
    const changeData = {
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    };

    it('should change password successfully', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockPasswordService.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await authService.changePassword('user-123', changeData);

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(mockPasswordService.compare).toHaveBeenCalledWith(
        changeData.currentPassword,
        mockUser.password
      );
      expect(mockPasswordService.hash).toHaveBeenCalledWith(changeData.newPassword);
      expect(mockUserRepository.updatePassword).toHaveBeenCalled();
      expect(mockAuthEvents.emitPasswordChange).toHaveBeenCalledWith('user-123');
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(authService.changePassword('user-123', changeData)).rejects.toThrow(
        'Usuário não encontrado'
      );
    });

    it('should throw error when current password is wrong', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockPasswordService.compare.mockResolvedValue(false);

      await expect(authService.changePassword('user-123', changeData)).rejects.toThrow(
        'Senha atual incorreta'
      );
    });

    it('should throw error when new password is same as current', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockPasswordService.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

      await expect(authService.changePassword('user-123', changeData)).rejects.toThrow(
        'Nova senha deve ser diferente da atual'
      );
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all sessions for user', async () => {
      mockRefreshTokenRepository.revokeAllForUser.mockResolvedValue(3);

      const result = await authService.revokeAllSessions('user-123');

      expect(mockRefreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('user-123');
      expect(result).toBe(3);
    });

    it('should revoke all sessions except current token', async () => {
      mockRefreshTokenRepository.revokeAllExcept.mockResolvedValue(2);

      const result = await authService.revokeAllSessions('user-123', 'current-token-id');

      expect(mockRefreshTokenRepository.revokeAllExcept).toHaveBeenCalledWith(
        'user-123',
        'current-token-id'
      );
      expect(result).toBe(2);
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions for user', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          userAgent: 'Mozilla/5.0',
          ipAddress: '192.168.1.1',
          createdAt: new Date('2026-01-01'),
          isValid: jest.fn().mockReturnValue(true),
        },
        {
          id: 'token-2',
          userAgent: 'Chrome',
          ipAddress: '192.168.1.2',
          createdAt: new Date('2026-01-02'),
          isValid: jest.fn().mockReturnValue(true),
        },
        {
          id: 'token-3',
          userAgent: null,
          ipAddress: null,
          createdAt: new Date('2026-01-03'),
          isValid: jest.fn().mockReturnValue(false),
        },
      ];

      mockRefreshTokenRepository.findActiveByUserId.mockResolvedValue(mockTokens as never);

      const result = await authService.getActiveSessions('user-123');

      expect(mockRefreshTokenRepository.findActiveByUserId).toHaveBeenCalledWith('user-123');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'token-1',
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
        createdAt: expect.any(Date),
      });
    });

    it('should return empty array when no active sessions', async () => {
      mockRefreshTokenRepository.findActiveByUserId.mockResolvedValue([]);

      const result = await authService.getActiveSessions('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('validateAccessToken', () => {
    it('should return valid true and userId for valid token', () => {
      mockTokenService.verifyAccessToken.mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      } as never);

      const result = authService.validateAccessToken('valid-token');

      expect(result).toEqual({ valid: true, userId: 'user-123' });
    });

    it('should return valid false for invalid token', () => {
      mockTokenService.verifyAccessToken.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const result = authService.validateAccessToken('invalid-token');

      expect(result).toEqual({ valid: false });
    });
  });
});
