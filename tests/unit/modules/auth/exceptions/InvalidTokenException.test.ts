import { InvalidTokenException } from '@/modules/auth/exceptions/InvalidTokenException';
import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode } from '@/shared/errors';

describe('InvalidTokenException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new InvalidTokenException();

      expect(exception.message).toBe('Token inválido ou expirado');
      expect(exception.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(exception.code).toBe(ErrorCode.INVALID_TOKEN);
    });

    it('should create an exception with custom message', () => {
      const exception = new InvalidTokenException('Custom message');

      expect(exception.message).toBe('Custom message');
      expect(exception.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(exception.code).toBe(ErrorCode.INVALID_TOKEN);
    });

    it('should extend AuthException', () => {
      const exception = new InvalidTokenException();

      expect(exception).toBeInstanceOf(AuthException);
    });

    it('should be operational', () => {
      const exception = new InvalidTokenException();

      expect(exception.isOperational).toBe(true);
    });
  });
});
