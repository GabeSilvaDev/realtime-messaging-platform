import { UsernameAlreadyExistsException } from '@/modules/auth/exceptions/UsernameAlreadyExistsException';
import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode } from '@/shared/errors';

describe('UsernameAlreadyExistsException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new UsernameAlreadyExistsException();

      expect(exception.message).toBe('Username já em uso');
      expect(exception.statusCode).toBe(HttpStatus.CONFLICT);
      expect(exception.code).toBe(ErrorCode.USERNAME_ALREADY_EXISTS);
    });

    it('should create an exception with custom message', () => {
      const exception = new UsernameAlreadyExistsException('Custom message');

      expect(exception.message).toBe('Custom message');
      expect(exception.statusCode).toBe(HttpStatus.CONFLICT);
      expect(exception.code).toBe(ErrorCode.USERNAME_ALREADY_EXISTS);
    });

    it('should extend AuthException', () => {
      const exception = new UsernameAlreadyExistsException();

      expect(exception).toBeInstanceOf(AuthException);
    });

    it('should be operational', () => {
      const exception = new UsernameAlreadyExistsException();

      expect(exception.isOperational).toBe(true);
    });
  });
});
