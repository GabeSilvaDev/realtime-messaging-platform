import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import {
  ProfileNotFoundException,
  InvalidAvatarUrlException,
  BioTooLongException,
  DisplayNameTooLongException,
} from '@/modules/user/errors/profile.errors';

describe('profile.errors', () => {
  describe('ProfileNotFoundException', () => {
    it('deve usar mensagem padrão', () => {
      const error = new ProfileNotFoundException();

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Perfil não encontrado');
      expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(error.code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('deve aceitar mensagem personalizada', () => {
      expect(new ProfileNotFoundException('Outro').message).toBe('Outro');
    });
  });

  describe('InvalidAvatarUrlException', () => {
    it('deve usar mensagem padrão', () => {
      const error = new InvalidAvatarUrlException();

      expect(error.message).toBe('URL do avatar inválida');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('deve aceitar mensagem personalizada', () => {
      expect(new InvalidAvatarUrlException('URL ruim').message).toBe('URL ruim');
    });
  });

  describe('BioTooLongException', () => {
    it('deve usar limite padrão de 500 caracteres', () => {
      const error = new BioTooLongException();

      expect(error.message).toBe('Bio muito longa. Máximo: 500 caracteres');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('deve aceitar limite personalizado', () => {
      expect(new BioTooLongException(200).message).toBe('Bio muito longa. Máximo: 200 caracteres');
    });
  });

  describe('DisplayNameTooLongException', () => {
    it('deve usar limite padrão de 100 caracteres', () => {
      const error = new DisplayNameTooLongException();

      expect(error.message).toBe('Nome de exibição muito longo. Máximo: 100 caracteres');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('deve aceitar limite personalizado', () => {
      expect(new DisplayNameTooLongException(50).message).toBe(
        'Nome de exibição muito longo. Máximo: 50 caracteres'
      );
    });
  });
});
