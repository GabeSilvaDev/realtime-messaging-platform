import {
  AppError,
  ValidationError,
  UnauthorizedError,
  HttpStatus,
  ErrorCode,
  AuthErrorReason,
} from '@/shared/errors';

describe('Errors Index Exports', () => {
  describe('AppError', () => {
    it('should be exported and usable', () => {
      const error = new AppError('Test error', HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.BAD_REQUEST);
    });

    it('should create error with details', () => {
      const details = [{ field: 'test', message: 'error' }];
      const error = new AppError(
        'Test error',
        HttpStatus.BAD_REQUEST,
        ErrorCode.BAD_REQUEST,
        true,
        details
      );

      expect(error.details).toEqual(details);
    });
  });

  describe('ValidationError', () => {
    it('should be exported and usable', () => {
      const error = new ValidationError('Validation failed');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should contain field errors', () => {
      const fieldErrors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const error = new ValidationError('Validation failed', fieldErrors);

      expect(error.fields).toEqual(fieldErrors);
    });
  });

  describe('UnauthorizedError', () => {
    it('should be exported and usable', () => {
      const error = new UnauthorizedError('Unauthorized', AuthErrorReason.INVALID_TOKEN);

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should have reason', () => {
      const error = new UnauthorizedError('Token has expired', AuthErrorReason.EXPIRED_TOKEN);

      expect(error.reason).toBe(AuthErrorReason.EXPIRED_TOKEN);
    });
  });

  describe('HttpStatus re-export', () => {
    it('should export all HttpStatus values', () => {
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

  describe('ErrorCode re-export', () => {
    it('should export all ErrorCode values', () => {
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

  describe('AuthErrorReason re-export', () => {
    it('should export all AuthErrorReason values', () => {
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
