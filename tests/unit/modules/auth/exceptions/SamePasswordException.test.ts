import { SamePasswordException } from '@/modules/auth/exceptions/SamePasswordException';
import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode } from '@/shared/errors';

describe('SamePasswordException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new SamePasswordException();

      expect(exception.message).toBe('Nova senha deve ser diferente da atual');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.SAME_PASSWORD);
    });

    it('should create an exception with custom message', () => {
      const exception = new SamePasswordException('Custom message');

      expect(exception.message).toBe('Custom message');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.SAME_PASSWORD);
    });

    it('should extend AuthException', () => {
      const exception = new SamePasswordException();

      expect(exception).toBeInstanceOf(AuthException);
    });

    it('should be operational', () => {
      const exception = new SamePasswordException();

      expect(exception.isOperational).toBe(true);
    });
  });
});
