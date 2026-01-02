import { HttpStatus, ErrorCode, AuthErrorReason } from '@/shared/types/error.types';

describe('Error Types', () => {
  describe('HttpStatus', () => {
    it('should have correct status codes', () => {
      expect(HttpStatus.OK).toBe(200);
      expect(HttpStatus.CREATED).toBe(201);
      expect(HttpStatus.NO_CONTENT).toBe(204);
      expect(HttpStatus.BAD_REQUEST).toBe(400);
      expect(HttpStatus.UNAUTHORIZED).toBe(401);
      expect(HttpStatus.FORBIDDEN).toBe(403);
      expect(HttpStatus.NOT_FOUND).toBe(404);
      expect(HttpStatus.CONFLICT).toBe(409);
      expect(HttpStatus.UNPROCESSABLE_ENTITY).toBe(422);
      expect(HttpStatus.TOO_MANY_REQUESTS).toBe(429);
      expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HttpStatus.SERVICE_UNAVAILABLE).toBe(503);
    });
  });

  describe('ErrorCode', () => {
    it('should have all error codes defined', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.CONFLICT).toBe('CONFLICT');
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCode.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('AuthErrorReason', () => {
    it('should have all auth error reasons defined', () => {
      expect(AuthErrorReason.INVALID_TOKEN).toBe('INVALID_TOKEN');
      expect(AuthErrorReason.EXPIRED_TOKEN).toBe('EXPIRED_TOKEN');
      expect(AuthErrorReason.MISSING_TOKEN).toBe('MISSING_TOKEN');
      expect(AuthErrorReason.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
      expect(AuthErrorReason.ACCOUNT_DISABLED).toBe('ACCOUNT_DISABLED');
      expect(AuthErrorReason.ACCOUNT_LOCKED).toBe('ACCOUNT_LOCKED');
      expect(AuthErrorReason.EMAIL_NOT_VERIFIED).toBe('EMAIL_NOT_VERIFIED');
      expect(AuthErrorReason.SESSION_EXPIRED).toBe('SESSION_EXPIRED');
      expect(AuthErrorReason.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });
});
