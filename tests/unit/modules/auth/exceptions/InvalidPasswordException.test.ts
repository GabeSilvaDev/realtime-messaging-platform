import { InvalidPasswordException } from '@/modules/auth/exceptions/InvalidPasswordException';
import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode } from '@/shared/errors';

describe('InvalidPasswordException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new InvalidPasswordException();

      expect(exception.message).toBe('Senha atual incorreta');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.INVALID_PASSWORD);
    });

    it('should create an exception with custom message', () => {
      const exception = new InvalidPasswordException('Custom message');

      expect(exception.message).toBe('Custom message');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.INVALID_PASSWORD);
    });

    it('should extend AuthException', () => {
      const exception = new InvalidPasswordException();

      expect(exception).toBeInstanceOf(AuthException);
    });

    it('should be operational', () => {
      const exception = new InvalidPasswordException();

      expect(exception.isOperational).toBe(true);
    });
  });
});
