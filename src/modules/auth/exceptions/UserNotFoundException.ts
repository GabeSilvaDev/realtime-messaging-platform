import { HttpStatus, ErrorCode } from '@/shared/errors';
import { AuthException } from './AuthException';

export class UserNotFoundException extends AuthException {
  constructor(message = 'Usuário não encontrado') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.USER_NOT_FOUND);
  }
}
