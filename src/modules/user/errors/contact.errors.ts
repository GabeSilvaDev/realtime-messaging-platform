import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

export class ContactNotFoundException extends AppError {
  constructor(message = 'Contato não encontrado') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class ContactAlreadyExistsException extends AppError {
  constructor(message = 'Este usuário já está nos seus contatos') {
    super(message, HttpStatus.CONFLICT, ErrorCode.DUPLICATE_ENTRY);
  }
}

export class CannotAddSelfException extends AppError {
  constructor(message = 'Você não pode adicionar a si mesmo como contato') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class UserBlockedException extends AppError {
  constructor(message = 'Este usuário está bloqueado') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.USER_BLOCKED);
  }
}

export class CannotBlockSelfException extends AppError {
  constructor(message = 'Você não pode bloquear a si mesmo') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}
