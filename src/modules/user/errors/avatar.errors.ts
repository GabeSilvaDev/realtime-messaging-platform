import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { uploadConfig } from '@/shared/config/upload';

export class InvalidAvatarError extends AppError {
  constructor(message = 'Avatar inválido') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class AvatarTooLargeError extends AppError {
  constructor() {
    const maxSizeMB = Math.round(uploadConfig.limits.maxAvatarSize / (1024 * 1024));
    super(
      `Avatar muito grande. Tamanho máximo: ${String(maxSizeMB)}MB`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class UnsupportedAvatarTypeError extends AppError {
  constructor(mimeType: string) {
    super(
      `Tipo de imagem não suportado: ${mimeType}. Use: JPEG, PNG, WebP ou GIF`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class AvatarProcessingFailedError extends AppError {
  constructor() {
    super(
      'Falha ao processar avatar. Tente novamente com outra imagem.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class AvatarNotFoundError extends AppError {
  constructor() {
    super('Avatar não encontrado', HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}
