import { UserNotFoundException } from '@/modules/auth/exceptions/UserNotFoundException';
import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode } from '@/shared/errors';

describe('UserNotFoundException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new UserNotFoundException();

      expect(exception.message).toBe('Usuário não encontrado');
      expect(exception.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(exception.code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('should create an exception with custom message', () => {
      const exception = new UserNotFoundException('Custom message');

      expect(exception.message).toBe('Custom message');
      expect(exception.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(exception.code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('should extend AuthException', () => {
      const exception = new UserNotFoundException();

      expect(exception).toBeInstanceOf(AuthException);
    });

    it('should be operational', () => {
      const exception = new UserNotFoundException();

      expect(exception.isOperational).toBe(true);
    });
  });
});
