import { HttpStatus, ErrorCode, AuthErrorReason } from '../types';
import type { ErrorDetails } from '../interfaces';
import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  public readonly reason: AuthErrorReason;

  constructor(message: string, reason: AuthErrorReason = AuthErrorReason.INVALID_TOKEN) {
    const details: ErrorDetails[] = [{ message, code: reason }];
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, true, details);

    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public override toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        reason: this.reason,
        timestamp: this.timestamp.toISOString(),
      },
    };
  }

  public static invalidToken(): UnauthorizedError {
    return new UnauthorizedError('Invalid or malformed token', AuthErrorReason.INVALID_TOKEN);
  }

  public static expiredToken(): UnauthorizedError {
    return new UnauthorizedError('Token has expired', AuthErrorReason.EXPIRED_TOKEN);
  }

  public static missingToken(): UnauthorizedError {
    return new UnauthorizedError('Authentication token is required', AuthErrorReason.MISSING_TOKEN);
  }

  public static invalidCredentials(): UnauthorizedError {
    return new UnauthorizedError('Invalid email or password', AuthErrorReason.INVALID_CREDENTIALS);
  }

  public static accountDisabled(): UnauthorizedError {
    return new UnauthorizedError('Account has been disabled', AuthErrorReason.ACCOUNT_DISABLED);
  }

  public static accountLocked(): UnauthorizedError {
    return new UnauthorizedError(
      'Account is locked due to too many failed attempts',
      AuthErrorReason.ACCOUNT_LOCKED
    );
  }

  public static emailNotVerified(): UnauthorizedError {
    return new UnauthorizedError(
      'Email address has not been verified',
      AuthErrorReason.EMAIL_NOT_VERIFIED
    );
  }

  public static sessionExpired(): UnauthorizedError {
    return new UnauthorizedError('Session has expired', AuthErrorReason.SESSION_EXPIRED);
  }

  public static insufficientPermissions(resource?: string): UnauthorizedError {
    const message =
      resource !== undefined
        ? `Insufficient permissions to access ${resource}`
        : 'Insufficient permissions';
    return new UnauthorizedError(message, AuthErrorReason.INSUFFICIENT_PERMISSIONS);
  }
}
