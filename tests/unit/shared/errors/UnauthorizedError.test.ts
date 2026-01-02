import { UnauthorizedError } from '@/shared/errors/UnauthorizedError';
import { HttpStatus, ErrorCode, AuthErrorReason } from '@/shared/types';

describe('UnauthorizedError', () => {
  describe('constructor', () => {
    it('should create an UnauthorizedError with default reason', () => {
      const error = new UnauthorizedError('Unauthorized');

      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.reason).toBe(AuthErrorReason.INVALID_TOKEN);
    });

    it('should create an UnauthorizedError with custom reason', () => {
      const error = new UnauthorizedError('Token expired', AuthErrorReason.EXPIRED_TOKEN);

      expect(error.reason).toBe(AuthErrorReason.EXPIRED_TOKEN);
    });

    it('should have correct prototype chain', () => {
      const error = new UnauthorizedError('Unauthorized');

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should include details with message and code', () => {
      const error = new UnauthorizedError('Token invalid', AuthErrorReason.INVALID_TOKEN);

      expect(error.details).toBeDefined();
      expect(error.details?.length).toBe(1);
      expect(error.details?.[0]?.message).toBe('Token invalid');
      expect(error.details?.[0]?.code).toBe(AuthErrorReason.INVALID_TOKEN);
    });
  });

  describe('toJSON', () => {
    it('should return a JSON representation with reason', () => {
      const error = new UnauthorizedError('Unauthorized', AuthErrorReason.MISSING_TOKEN);
      const json = error.toJSON();

      expect(json.error).toHaveProperty('reason', AuthErrorReason.MISSING_TOKEN);
      expect(json.error).toHaveProperty('code', ErrorCode.UNAUTHORIZED);
      expect(json.error).toHaveProperty('message', 'Unauthorized');
      expect(json.error).toHaveProperty('statusCode', HttpStatus.UNAUTHORIZED);
      expect(json.error).toHaveProperty('timestamp');
    });
  });

  describe('static factory methods', () => {
    it('should create an invalidToken error', () => {
      const error = UnauthorizedError.invalidToken();

      expect(error.reason).toBe(AuthErrorReason.INVALID_TOKEN);
      expect(error.message).toBe('Invalid or malformed token');
    });

    it('should create an expiredToken error', () => {
      const error = UnauthorizedError.expiredToken();

      expect(error.reason).toBe(AuthErrorReason.EXPIRED_TOKEN);
      expect(error.message).toBe('Token has expired');
    });

    it('should create a missingToken error', () => {
      const error = UnauthorizedError.missingToken();

      expect(error.reason).toBe(AuthErrorReason.MISSING_TOKEN);
      expect(error.message).toBe('Authentication token is required');
    });

    it('should create an invalidCredentials error', () => {
      const error = UnauthorizedError.invalidCredentials();

      expect(error.reason).toBe(AuthErrorReason.INVALID_CREDENTIALS);
      expect(error.message).toBe('Invalid email or password');
    });

    it('should create an accountDisabled error', () => {
      const error = UnauthorizedError.accountDisabled();

      expect(error.reason).toBe(AuthErrorReason.ACCOUNT_DISABLED);
      expect(error.message).toBe('Account has been disabled');
    });

    it('should create an accountLocked error', () => {
      const error = UnauthorizedError.accountLocked();

      expect(error.reason).toBe(AuthErrorReason.ACCOUNT_LOCKED);
      expect(error.message).toBe('Account is locked due to too many failed attempts');
    });

    it('should create an emailNotVerified error', () => {
      const error = UnauthorizedError.emailNotVerified();

      expect(error.reason).toBe(AuthErrorReason.EMAIL_NOT_VERIFIED);
      expect(error.message).toBe('Email address has not been verified');
    });

    it('should create a sessionExpired error', () => {
      const error = UnauthorizedError.sessionExpired();

      expect(error.reason).toBe(AuthErrorReason.SESSION_EXPIRED);
      expect(error.message).toBe('Session has expired');
    });

    it('should create an insufficientPermissions error without resource', () => {
      const error = UnauthorizedError.insufficientPermissions();

      expect(error.reason).toBe(AuthErrorReason.INSUFFICIENT_PERMISSIONS);
      expect(error.message).toBe('Insufficient permissions');
    });

    it('should create an insufficientPermissions error with resource', () => {
      const error = UnauthorizedError.insufficientPermissions('admin dashboard');

      expect(error.reason).toBe(AuthErrorReason.INSUFFICIENT_PERMISSIONS);
      expect(error.message).toBe('Insufficient permissions to access admin dashboard');
    });
  });
});
