import { InvalidCredentialsException } from '@/modules/auth/exceptions/InvalidCredentialsException';
import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode } from '@/shared/errors';

describe('InvalidCredentialsException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new InvalidCredentialsException();

      expect(exception.message).toBe('Credenciais inválidas');
      expect(exception.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(exception.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });

    it('should create an exception with custom message', () => {
      const exception = new InvalidCredentialsException('Custom message');

      expect(exception.message).toBe('Custom message');
      expect(exception.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(exception.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });

    it('should extend AuthException', () => {
      const exception = new InvalidCredentialsException();

      expect(exception).toBeInstanceOf(AuthException);
    });

    it('should be operational', () => {
      const exception = new InvalidCredentialsException();

      expect(exception.isOperational).toBe(true);
    });
  });
});
