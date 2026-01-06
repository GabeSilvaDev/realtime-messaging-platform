import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode, AppError } from '@/shared/errors';

describe('AuthException', () => {
  describe('constructor', () => {
    it('should create an exception with default values', () => {
      const exception = new AuthException('Auth error');

      expect(exception.message).toBe('Auth error');
      expect(exception.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(exception.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(exception.isOperational).toBe(true);
    });

    it('should create an exception with custom values', () => {
      const exception = new AuthException(
        'Custom error',
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN
      );

      expect(exception.message).toBe('Custom error');
      expect(exception.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(exception.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('should extend AppError', () => {
      const exception = new AuthException('Test');

      expect(exception).toBeInstanceOf(AppError);
      expect(exception).toBeInstanceOf(Error);
    });

    it('should have a timestamp', () => {
      const before = new Date();
      const exception = new AuthException('Test');
      const after = new Date();

      expect(exception.timestamp).toBeInstanceOf(Date);
      expect(exception.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(exception.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
