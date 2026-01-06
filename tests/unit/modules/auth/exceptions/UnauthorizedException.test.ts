import { UnauthorizedException } from '@/modules/auth/exceptions/UnauthorizedException';
import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode } from '@/shared/errors';

describe('UnauthorizedException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new UnauthorizedException();

      expect(exception.message).toBe('Usuário não autenticado');
      expect(exception.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(exception.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should create an exception with custom message', () => {
      const exception = new UnauthorizedException('Custom message');

      expect(exception.message).toBe('Custom message');
      expect(exception.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(exception.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should extend AuthException', () => {
      const exception = new UnauthorizedException();

      expect(exception).toBeInstanceOf(AuthException);
    });

    it('should be operational', () => {
      const exception = new UnauthorizedException();

      expect(exception.isOperational).toBe(true);
    });
  });
});
