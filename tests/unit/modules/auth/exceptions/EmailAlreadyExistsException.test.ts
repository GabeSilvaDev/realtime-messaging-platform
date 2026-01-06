import { EmailAlreadyExistsException } from '@/modules/auth/exceptions/EmailAlreadyExistsException';
import { AuthException } from '@/modules/auth/exceptions/AuthException';
import { HttpStatus, ErrorCode } from '@/shared/errors';

describe('EmailAlreadyExistsException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new EmailAlreadyExistsException();

      expect(exception.message).toBe('Email já cadastrado');
      expect(exception.statusCode).toBe(HttpStatus.CONFLICT);
      expect(exception.code).toBe(ErrorCode.EMAIL_ALREADY_EXISTS);
    });

    it('should create an exception with custom message', () => {
      const exception = new EmailAlreadyExistsException('Custom message');

      expect(exception.message).toBe('Custom message');
      expect(exception.statusCode).toBe(HttpStatus.CONFLICT);
      expect(exception.code).toBe(ErrorCode.EMAIL_ALREADY_EXISTS);
    });

    it('should extend AuthException', () => {
      const exception = new EmailAlreadyExistsException();

      expect(exception).toBeInstanceOf(AuthException);
    });

    it('should be operational', () => {
      const exception = new EmailAlreadyExistsException();

      expect(exception.isOperational).toBe(true);
    });
  });
});
