import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

export class UserNotFoundException extends AppError {
  constructor(message = 'Usuário não encontrado') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.USER_NOT_FOUND);
  }
}

export class EmailAlreadyExistsException extends AppError {
  constructor(message = 'Email já está em uso') {
    super(message, HttpStatus.CONFLICT, ErrorCode.EMAIL_ALREADY_EXISTS);
  }
}

export class UsernameAlreadyExistsException extends AppError {
  constructor(message = 'Username já está em uso') {
    super(message, HttpStatus.CONFLICT, ErrorCode.USERNAME_ALREADY_EXISTS);
  }
}

export class CannotDeleteSelfException extends AppError {
  constructor(message = 'Não é possível excluir sua própria conta por esta rota') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}
