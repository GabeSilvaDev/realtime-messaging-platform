import { HttpStatus, ErrorCode } from '@/shared/errors';
import { AuthException } from './AuthException';

export class EmailAlreadyExistsException extends AuthException {
  constructor(message = 'Email já cadastrado') {
    super(message, HttpStatus.CONFLICT, ErrorCode.EMAIL_ALREADY_EXISTS);
  }
}
