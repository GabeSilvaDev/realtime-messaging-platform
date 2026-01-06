import type { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '@/modules/auth/middlewares/asyncHandler';
import { AppError, HttpStatus, ErrorCode } from '@/shared/errors';
import { ValidationException } from '@/modules/auth/exceptions/ValidationException';

describe('asyncHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock<NextFunction>;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('successful handler execution', () => {
    it('should execute async handler successfully', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should execute sync handler successfully', () => {
      const handler = jest.fn();
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);

      expect(handler).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should pass AppError to next middleware', async () => {
      const appError = new AppError('Test error', HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
      const handler = jest.fn().mockRejectedValue(appError);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNext).toHaveBeenCalledWith(appError);
    });

    it('should pass AppError-like objects to next middleware', async () => {
      const appErrorLike = {
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
        isOperational: true,
      };
      const handler = jest.fn().mockRejectedValue(appErrorLike);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNext).toHaveBeenCalled();
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(passedError.code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('should transform ZodError to ValidationException', async () => {
      const zodError = new Error('Validation failed');
      zodError.name = 'ZodError';
      (zodError as unknown as { issues: { path: string[]; message: string }[] }).issues = [
        { path: ['email'], message: 'Email inválido' },
      ];
      const handler = jest.fn().mockRejectedValue(zodError);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNext).toHaveBeenCalled();
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(passedError.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should transform ZodError without issues to ValidationException', async () => {
      const zodError = new Error('Validation failed');
      zodError.name = 'ZodError';
      const handler = jest.fn().mockRejectedValue(zodError);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNext).toHaveBeenCalled();
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError).toBeInstanceOf(ValidationException);
    });

    it('should transform generic Error to internal AppError', async () => {
      const genericError = new Error('Something went wrong');
      const handler = jest.fn().mockRejectedValue(genericError);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNext).toHaveBeenCalled();
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(passedError.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should transform non-Error values to internal AppError', async () => {
      const handler = jest.fn().mockRejectedValue('string error');
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNext).toHaveBeenCalled();
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(passedError.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should transform null to internal AppError', async () => {
      const handler = jest.fn().mockRejectedValue(null);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNext).toHaveBeenCalled();
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
