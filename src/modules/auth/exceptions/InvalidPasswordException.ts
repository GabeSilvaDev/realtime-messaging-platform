import { HttpStatus, ErrorCode } from '@/shared/errors';
import { AuthException } from './AuthException';

export class InvalidPasswordException extends AuthException {
  constructor(message = 'Senha atual incorreta') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.INVALID_PASSWORD);
  }
}
