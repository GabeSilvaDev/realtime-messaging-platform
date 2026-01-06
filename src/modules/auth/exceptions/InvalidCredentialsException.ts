import { HttpStatus, ErrorCode } from '@/shared/errors';
import { AuthException } from './AuthException';

export class InvalidCredentialsException extends AuthException {
  constructor(message = 'Credenciais inválidas') {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS);
  }
}
