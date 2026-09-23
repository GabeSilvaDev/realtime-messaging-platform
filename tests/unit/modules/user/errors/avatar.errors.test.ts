import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { uploadConfig } from '@/shared/config/upload';
import {
  InvalidAvatarError,
  AvatarTooLargeError,
  UnsupportedAvatarTypeError,
  AvatarProcessingFailedError,
  AvatarNotFoundError,
} from '@/modules/user/errors/avatar.errors';

describe('avatar.errors', () => {
  describe('InvalidAvatarError', () => {
    it('deve usar mensagem padrão', () => {
      const error = new InvalidAvatarError();

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Avatar inválido');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('deve aceitar mensagem personalizada', () => {
      expect(new InvalidAvatarError('Arquivo vazio').message).toBe('Arquivo vazio');
    });
  });

  describe('AvatarTooLargeError', () => {
    it('deve informar o tamanho máximo em MB', () => {
      const maxSizeMB = Math.round(uploadConfig.limits.maxAvatarSize / (1024 * 1024));
      const error = new AvatarTooLargeError();

      expect(error.message).toBe(`Avatar muito grande. Tamanho máximo: ${String(maxSizeMB)}MB`);
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('UnsupportedAvatarTypeError', () => {
    it('deve incluir o mimetype na mensagem', () => {
      const error = new UnsupportedAvatarTypeError('image/bmp');

      expect(error.message).toBe(
        'Tipo de imagem não suportado: image/bmp. Use: JPEG, PNG, WebP ou GIF'
      );
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('AvatarProcessingFailedError', () => {
    it('deve retornar 422 com mensagem padrão', () => {
      const error = new AvatarProcessingFailedError();

      expect(error.message).toBe('Falha ao processar avatar. Tente novamente com outra imagem.');
      expect(error.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('AvatarNotFoundError', () => {
    it('deve retornar 404 com código NOT_FOUND', () => {
      const error = new AvatarNotFoundError();

      expect(error.message).toBe('Avatar não encontrado');
      expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
    });
  });
});
