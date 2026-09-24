import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

export class ProfileNotFoundException extends AppError {
  constructor(message = 'Perfil não encontrado') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.USER_NOT_FOUND);
  }
}

export class InvalidAvatarUrlException extends AppError {
  constructor(message = 'URL do avatar inválida') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class BioTooLongException extends AppError {
  constructor(maxLength = 500) {
    super(
      `Bio muito longa. Máximo: ${String(maxLength)} caracteres`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class DisplayNameTooLongException extends AppError {
  constructor(maxLength = 100) {
    super(
      `Nome de exibição muito longo. Máximo: ${String(maxLength)} caracteres`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

/** Offline não é status manual: o usuário fica offline ao desconectar o último socket. */
export class OfflineStatusNotAllowedException extends AppError {
  constructor(message = 'Não é possível definir offline manualmente: use a desconexão') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);
  }
}
