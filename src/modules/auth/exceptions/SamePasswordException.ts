import { HttpStatus, ErrorCode } from '@/shared/errors';
import { AuthException } from './AuthException';

export class SamePasswordException extends AuthException {
  constructor(message = 'Nova senha deve ser diferente da atual') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.SAME_PASSWORD);
  }
}
