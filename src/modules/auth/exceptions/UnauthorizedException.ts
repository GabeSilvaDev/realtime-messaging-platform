import { HttpStatus, ErrorCode } from '@/shared/errors';
import { AuthException } from './AuthException';

export class UnauthorizedException extends AuthException {
  constructor(message = 'Usuário não autenticado') {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
  }
}
