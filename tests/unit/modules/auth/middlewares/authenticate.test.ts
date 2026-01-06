import type { Request, Response, NextFunction } from 'express';
import { HttpStatus, ErrorCode, AppError } from '@/shared/errors';

const mockValidateAccessToken = jest.fn();
const mockVerifyAccessToken = jest.fn();
const mockExtractFromHeader = jest.fn();

jest.mock('@/modules/auth/services/AuthService', () => ({
  authService: {
    validateAccessToken: mockValidateAccessToken,
  },
}));

jest.mock('@/modules/auth/services/TokenService', () => ({
  TokenService: jest.fn().mockImplementation(() => ({
    verifyAccessToken: mockVerifyAccessToken,
    extractFromHeader: mockExtractFromHeader,
  })),
}));

import { authenticate, optionalAuth } from '@/modules/auth/middlewares/authenticate';

describe('authenticate middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      headers: {},
    };
    mockRes = {};
    mockNext = jest.fn();
  });

  describe('authenticate', () => {
    it('should call next with error when no authorization header', () => {
      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Token de autenticação não fornecido',
        })
      );
    });

    it('should call next with error when authorization header is empty', () => {
      mockReq.headers = { authorization: '' };

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
        })
      );
    });

    it('should call next with error when token extraction fails', () => {
      mockReq.headers = { authorization: 'Bearer token' };
      mockExtractFromHeader.mockReturnValue(null);

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          code: ErrorCode.INVALID_TOKEN,
        })
      );
    });

    it('should call next with error when token validation fails', () => {
      mockReq.headers = { authorization: 'Bearer validtoken' };
      mockExtractFromHeader.mockReturnValue('validtoken');
      mockValidateAccessToken.mockReturnValue({ valid: false });

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          code: ErrorCode.INVALID_TOKEN,
        })
      );
    });

    it('should call next with error when validation returns empty userId', () => {
      mockReq.headers = { authorization: 'Bearer validtoken' };
      mockExtractFromHeader.mockReturnValue('validtoken');
      mockValidateAccessToken.mockReturnValue({ valid: true, userId: '' });

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
        })
      );
    });

    it('should set req.user and call next when token is valid', () => {
      mockReq.headers = { authorization: 'Bearer validtoken' };
      mockExtractFromHeader.mockReturnValue('validtoken');
      mockValidateAccessToken.mockReturnValue({ valid: true, userId: 'user-123' });
      mockVerifyAccessToken.mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should call next with error when verifyAccessToken throws', () => {
      mockReq.headers = { authorization: 'Bearer validtoken' };
      mockExtractFromHeader.mockReturnValue('validtoken');
      mockValidateAccessToken.mockReturnValue({ valid: true, userId: 'user-123' });
      mockVerifyAccessToken.mockImplementation(() => {
        throw new Error('Token expired');
      });

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          code: ErrorCode.INVALID_TOKEN,
        })
      );
    });

    it('should pass through AppError when thrown internally', () => {
      mockReq.headers = { authorization: 'Bearer validtoken' };
      mockExtractFromHeader.mockReturnValue('validtoken');
      const appError = new AppError('Custom error', HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
      mockValidateAccessToken.mockImplementation(() => {
        throw appError;
      });

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(appError);
    });
  });

  describe('optionalAuth', () => {
    it('should call next without setting user when no authorization header', () => {
      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should call next without setting user when authorization header is empty', () => {
      mockReq.headers = { authorization: '' };

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should call next without setting user when token extraction returns null', () => {
      mockReq.headers = { authorization: 'Bearer token' };
      mockExtractFromHeader.mockReturnValue(null);

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should call next without setting user when token extraction returns empty string', () => {
      mockReq.headers = { authorization: 'Bearer ' };
      mockExtractFromHeader.mockReturnValue('');

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should call next without setting user when validation fails', () => {
      mockReq.headers = { authorization: 'Bearer invalidtoken' };
      mockExtractFromHeader.mockReturnValue('invalidtoken');
      mockValidateAccessToken.mockReturnValue({ valid: false });

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should set req.user and call next when token is valid', () => {
      mockReq.headers = { authorization: 'Bearer validtoken' };
      mockExtractFromHeader.mockReturnValue('validtoken');
      mockValidateAccessToken.mockReturnValue({ valid: true, userId: 'user-123' });
      mockVerifyAccessToken.mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should call next without user when verifyAccessToken throws', () => {
      mockReq.headers = { authorization: 'Bearer validtoken' };
      mockExtractFromHeader.mockReturnValue('validtoken');
      mockValidateAccessToken.mockReturnValue({ valid: true, userId: 'user-123' });
      mockVerifyAccessToken.mockImplementation(() => {
        throw new Error('Token expired');
      });

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should call next without user when validateAccessToken throws', () => {
      mockReq.headers = { authorization: 'Bearer validtoken' };
      mockExtractFromHeader.mockReturnValue('validtoken');
      mockValidateAccessToken.mockImplementation(() => {
        throw new Error('Validation error');
      });

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
