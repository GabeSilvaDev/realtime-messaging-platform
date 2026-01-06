import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import type { NextFunction, Request, Response } from 'express';

const mockChildLogger = {
  setCategory: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

const mockLogger = {
  child: jest.fn().mockReturnValue(mockChildLogger),
};

jest.mock('@/shared/logger', () => ({
  getLogger: jest.fn(),
  LogCategory: {
    HTTP: 'HTTP',
  },
}));

import * as loggerModule from '@/shared/logger';
import { errorHandler } from '@/shared/middlewares/errorHandler';

describe('errorHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the child logger mock
    mockLogger.child.mockReturnValue(mockChildLogger);
    (loggerModule.getLogger as jest.Mock).mockReturnValue(mockLogger);

    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    mockReq = {
      headers: { 'x-request-id': 'test-request-123' },
      path: '/test/path',
      method: 'GET',
    };

    mockRes = {
      status: mockStatus,
    };

    mockNext = jest.fn();
  });

  describe('when error is an AppError', () => {
    it('should respond with the AppError status code and details', () => {
      const appError = AppError.badRequest('Invalid input', [{ field: 'email', message: 'Invalid email' }]);

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.BAD_REQUEST,
            message: 'Invalid input',
            statusCode: HttpStatus.BAD_REQUEST,
            details: [{ field: 'email', message: 'Invalid email' }],
            requestId: 'test-request-123',
          }),
        })
      );
    });

    it('should log warning for client errors (4xx)', () => {
      const appError = AppError.notFound('User');

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockLogger.child).toHaveBeenCalledWith('ErrorHandler');
      expect(mockChildLogger.setCategory).toHaveBeenCalledWith('HTTP');
      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        '[test-request-123] User not found',
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          path: '/test/path',
          method: 'GET',
        })
      );
    });

    it('should log error for server errors (5xx)', () => {
      const appError = AppError.internal('Database connection failed');

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        '[test-request-123] Database connection failed',
        appError,
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          path: '/test/path',
          method: 'GET',
        })
      );
    });

    it('should log error for service unavailable (503)', () => {
      const appError = AppError.serviceUnavailable('Redis');

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        '[test-request-123] Redis is currently unavailable',
        appError,
        expect.objectContaining({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: ErrorCode.SERVICE_UNAVAILABLE,
        })
      );
    });

    it('should include timestamp in the response', () => {
      const appError = AppError.badRequest('Test');

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            timestamp: expect.any(String),
          }),
        })
      );
    });
  });

  describe('when error is a generic Error', () => {
    it('should respond with 500 Internal Server Error', () => {
      const genericError = new Error('Something went wrong');

      errorHandler(genericError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.INTERNAL_ERROR,
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            requestId: 'test-request-123',
          }),
        })
      );
    });

    it('should log error for generic errors', () => {
      const genericError = new Error('Unexpected failure');

      errorHandler(genericError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        '[test-request-123] Unexpected failure',
        genericError,
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          path: '/test/path',
          method: 'GET',
        })
      );
    });

    it('should include timestamp in error response', () => {
      const genericError = new Error('Test');

      errorHandler(genericError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            timestamp: expect.any(String),
          }),
        })
      );
    });
  });

  describe('when request has no x-request-id header', () => {
    it('should use "unknown" as requestId', () => {
      mockReq.headers = {};
      const appError = AppError.badRequest('Test');

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            requestId: 'unknown',
          }),
        })
      );
    });
  });

  describe('when logger is not initialized', () => {
    it('should not throw and still respond correctly', () => {
      (loggerModule.getLogger as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Logger not initialized');
      });

      const appError = AppError.badRequest('Test');

      expect(() => {
        errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);
      }).not.toThrow();

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalled();
    });

    it('should handle generic error when logger is not available', () => {
      (loggerModule.getLogger as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Logger not initialized');
      });

      const genericError = new Error('Some error');

      expect(() => {
        errorHandler(genericError, mockReq as Request, mockRes as Response, mockNext);
      }).not.toThrow();

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('error details handling', () => {
    it('should include error details when present in AppError', () => {
      const details = [{ field: 'email', message: 'Invalid email' }, { field: 'password', message: 'Too short' }];
      const appError = AppError.badRequest('Validation failed', details);

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details,
          }),
        })
      );
    });

    it('should handle AppError without details', () => {
      const appError = new AppError('Not authenticated', HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.UNAUTHORIZED,
            message: 'Not authenticated',
          }),
        })
      );
    });
  });

  describe('different HTTP methods', () => {
    it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('should log correct method for %s requests', (method) => {
      mockReq.method = method;
      const appError = AppError.badRequest('Test');

      errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method,
        })
      );
    });
  });
});
