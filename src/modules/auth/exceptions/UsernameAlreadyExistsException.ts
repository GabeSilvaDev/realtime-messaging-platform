import { HttpStatus, ErrorCode } from '@/shared/errors';
import { AuthException } from './AuthException';

export class UsernameAlreadyExistsException extends AuthException {
  constructor(message = 'Username já em uso') {
    super(message, HttpStatus.CONFLICT, ErrorCode.USERNAME_ALREADY_EXISTS);
  }
}
