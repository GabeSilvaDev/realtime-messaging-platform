import { AppError, HttpStatus, ErrorCode } from '@/shared/errors';

export class AuthException extends AppError {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.UNAUTHORIZED,
    code: ErrorCode = ErrorCode.UNAUTHORIZED
  ) {
    super(message, statusCode, code);
  }
}
