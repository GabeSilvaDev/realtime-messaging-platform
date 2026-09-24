import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

export class TypingNotAllowedException extends AppError {
  constructor(message = 'Indicador de digitação disponível apenas em conversas 1:1') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);
  }
}
