import { HttpStatus, ErrorCode } from '@/shared/errors';
import { AuthException } from './AuthException';

export class InvalidTokenException extends AuthException {
  constructor(message = 'Token inválido ou expirado') {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_TOKEN);
  }
}
