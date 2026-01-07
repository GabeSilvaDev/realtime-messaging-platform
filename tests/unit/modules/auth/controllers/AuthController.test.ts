import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { UnauthorizedException } from '@/modules/auth/exceptions/UnauthorizedException';

jest.mock('@/modules/auth/services/AuthService', () => ({
  authService: {
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
    getActiveSessions: jest.fn(),
    revokeAllSessions: jest.fn(),
    validateAccessToken: jest.fn(),
  },
}));

import { AuthController } from '@/modules/auth/controllers/AuthController';
import { authService } from '@/modules/auth/services/AuthService';

const mockedAuthService = authService as jest.Mocked<typeof authService>;

describe('AuthController', () => {
  let controller: AuthController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockReq = {
      body: {},
      headers: {},
      query: {},
      ip: '127.0.0.1',
    };
  });

  describe('register', () => {
    const validRegisterData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password123!',
      displayName: 'Test User',
    };

    it('should register user successfully', async () => {
      mockReq.body = validRegisterData;
      const result = {
        user: { id: '1', username: 'testuser', email: 'test@example.com', displayName: 'Test User' },
        tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 900 },
      };
      mockedAuthService.register.mockResolvedValue(result);

      await controller.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: result,
      });
    });

    it('should extract auth context from request', async () => {
      mockReq.body = validRegisterData;
      mockReq.headers = {
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'Test Agent',
      };
      mockedAuthService.register.mockResolvedValue({
        user: { id: '1', username: 'testuser', email: 'test@example.com', displayName: 'Test User' },
        tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 900 },
      });

      await controller.register(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.register).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          ipAddress: '192.168.1.1',
          userAgent: 'Test Agent',
        })
      );
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login user successfully', async () => {
      mockReq.body = validLoginData;
      const result = {
        user: { id: '1', username: 'testuser', email: 'test@example.com', displayName: 'Test User' },
        tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 900 },
      };
      mockedAuthService.login.mockResolvedValue(result);

      await controller.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: result,
      });
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      mockReq.body = { refreshToken: 'valid-token' };
      mockedAuthService.logout.mockResolvedValue(undefined);

      await controller.logout(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logout realizado com sucesso',
      });
      expect(mockedAuthService.logout).toHaveBeenCalledWith('valid-token');
    });
  });

  describe('refresh', () => {
    it('should refresh tokens successfully', async () => {
      mockReq.body = { refreshToken: 'valid-token' };
      const result = {
        tokens: { accessToken: 'new-token', refreshToken: 'new-refresh', expiresIn: 900 },
      };
      mockedAuthService.refresh.mockResolvedValue(result);

      await controller.refresh(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: result,
      });
    });
  });

  describe('forgotPassword', () => {
    it('should request password reset successfully', async () => {
      mockReq.body = { email: 'test@example.com' };
      mockedAuthService.forgotPassword.mockResolvedValue({ token: 'reset-token' });

      await controller.forgotPassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Se o email existir, você receberá um link de recuperação',
      });
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      mockReq.body = { token: 'reset-token', newPassword: 'NewPassword123!' };
      mockedAuthService.resetPassword.mockResolvedValue(undefined);

      await controller.resetPassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Senha alterada com sucesso',
      });
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockReq.body = { currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' };
      mockReq.user = { id: 'user-123', email: 'test@example.com', username: 'testuser' };
      mockedAuthService.changePassword.mockResolvedValue(undefined);

      await controller.changePassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Senha alterada com sucesso',
      });
      expect(mockedAuthService.changePassword).toHaveBeenCalledWith('user-123', expect.any(Object));
    });

    it('should throw UnauthorizedException when user is not authenticated', async () => {
      mockReq.body = { currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' };
      mockReq.user = undefined;

      await expect(
        controller.changePassword(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getSessions', () => {
    it('should return active sessions', async () => {
      mockReq.user = { id: 'user-123', email: 'test@example.com', username: 'testuser' };
      const sessions = [
        { id: 'session-1', userAgent: 'Mozilla/5.0', ipAddress: '127.0.0.1', createdAt: new Date() },
        { id: 'session-2', userAgent: 'Chrome/100.0', ipAddress: '192.168.1.1', createdAt: new Date() },
      ];
      mockedAuthService.getActiveSessions.mockResolvedValue(sessions);

      await controller.getSessions(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { sessions },
      });
    });

    it('should throw UnauthorizedException when user is not authenticated', async () => {
      mockReq.user = undefined;

      await expect(
        controller.getSessions(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('revokeSessions', () => {
    it('should revoke all sessions', async () => {
      mockReq.user = { id: 'user-123', email: 'test@example.com', username: 'testuser' };
      mockReq.query = {};
      mockedAuthService.revokeAllSessions.mockResolvedValue(3);

      await controller.revokeSessions(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: '3 sessão(ões) revogada(s)',
        data: { revokedCount: 3 },
      });
    });

    it('should keep current session when keepCurrent is true', async () => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        tokenId: 'token-123',
      };
      mockReq.query = { keepCurrent: 'true' };
      mockedAuthService.revokeAllSessions.mockResolvedValue(2);

      await controller.revokeSessions(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.revokeAllSessions).toHaveBeenCalledWith('user-123', 'token-123');
    });

    it('should not keep current session when keepCurrent is false', async () => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        tokenId: 'token-123',
      };
      mockReq.query = { keepCurrent: 'false' };
      mockedAuthService.revokeAllSessions.mockResolvedValue(3);

      await controller.revokeSessions(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.revokeAllSessions).toHaveBeenCalledWith('user-123', undefined);
    });
  });

  describe('me', () => {
    it('should return current user data', () => {
      mockReq.user = { id: 'user-123', email: 'test@example.com', username: 'testuser' };

      controller.me(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
        },
      });
    });

    it('should throw UnauthorizedException when user is undefined', () => {
      mockReq.user = undefined;

      expect(() => controller.me(mockReq as Request, mockRes as Response)).toThrow(
        UnauthorizedException
      );
    });
  });

  describe('getAuthContext', () => {
    const mockAuthResponse = {
      user: { id: '1', username: 'testuser', email: 'test@example.com', displayName: 'Test User' },
      tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 900 },
    };

    it('should extract IP from x-forwarded-for header', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Password123!' };
      mockReq.headers = { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' };
      mockedAuthService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.login).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ ipAddress: '192.168.1.1' })
      );
    });

    it('should use req.ip when x-forwarded-for is not present', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Password123!' };
      mockReq.headers = {};
      (mockReq as { ip: string }).ip = '10.0.0.1';
      mockedAuthService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.login).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ ipAddress: '10.0.0.1' })
      );
    });

    it('should handle null userAgent', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Password123!' };
      mockReq.headers = {};
      mockedAuthService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.login).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ userAgent: null })
      );
    });

    it('should return null IP when req.ip is undefined and no x-forwarded-for', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Password123!' };
      mockReq.headers = {};
      (mockReq as { ip: string | undefined }).ip = undefined;
      mockedAuthService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.login).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ ipAddress: null })
      );
    });

    it('should return null IP when req.ip is empty string', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Password123!' };
      mockReq.headers = {};
      (mockReq as { ip: string }).ip = '';
      mockedAuthService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.login).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ ipAddress: null })
      );
    });

    it('should return null IP when x-forwarded-for is an array', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Password123!' };
      mockReq.headers = { 'x-forwarded-for': ['192.168.1.1', '10.0.0.1'] };
      (mockReq as { ip: string | undefined }).ip = undefined;
      mockedAuthService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.login).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ ipAddress: null })
      );
    });

    it('should handle empty x-forwarded-for string', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Password123!' };
      mockReq.headers = { 'x-forwarded-for': '' };
      (mockReq as { ip: string | undefined }).ip = undefined;
      mockedAuthService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(mockReq as Request, mockRes as Response);

      expect(mockedAuthService.login).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ ipAddress: '' })
      );
    });
  });
});
