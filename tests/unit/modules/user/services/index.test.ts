import {
  CannotDeleteSelfException,
  EmailAlreadyExistsException,
  UserNotFoundException,
  UserService,
  UsernameAlreadyExistsException,
  userService,
} from '@/modules/user/services/UserService';

import {
  InvalidAvatarUrlException,
  ProfileNotFoundException,
  ProfileService,
  profileService,
} from '@/modules/user/services/ProfileService';

import {
  CannotAddSelfException,
  CannotBlockSelfException,
  ContactAlreadyExistsException,
  ContactNotFoundException,
  ContactService,
  UserBlockedException,
  contactService,
} from '@/modules/user/services/ContactService';

describe('services/index exports', () => {
  describe('UserService exports', () => {
    it('deve exportar UserService', () => {
      expect(UserService).toBeDefined();
      expect(typeof UserService).toBe('function');
    });

    it('deve exportar userService instance', () => {
      expect(userService).toBeDefined();
      expect(userService).toBeInstanceOf(UserService);
    });

    it('deve exportar UserNotFoundException', () => {
      expect(UserNotFoundException).toBeDefined();
      const exception = new UserNotFoundException();
      expect(exception.message).toBe('Usuário não encontrado');
    });

    it('deve exportar EmailAlreadyExistsException', () => {
      expect(EmailAlreadyExistsException).toBeDefined();
      const exception = new EmailAlreadyExistsException();
      expect(exception.message).toBe('Email já está em uso');
    });

    it('deve exportar UsernameAlreadyExistsException', () => {
      expect(UsernameAlreadyExistsException).toBeDefined();
      const exception = new UsernameAlreadyExistsException();
      expect(exception.message).toBe('Username já está em uso');
    });

    it('deve exportar CannotDeleteSelfException', () => {
      expect(CannotDeleteSelfException).toBeDefined();
      const exception = new CannotDeleteSelfException();
      expect(exception.message).toBe('Não é possível excluir sua própria conta por esta rota');
    });
  });

  describe('ProfileService exports', () => {
    it('deve exportar ProfileService', () => {
      expect(ProfileService).toBeDefined();
      expect(typeof ProfileService).toBe('function');
    });

    it('deve exportar profileService instance', () => {
      expect(profileService).toBeDefined();
      expect(profileService).toBeInstanceOf(ProfileService);
    });

    it('deve exportar ProfileNotFoundException', () => {
      expect(ProfileNotFoundException).toBeDefined();
      const exception = new ProfileNotFoundException();
      expect(exception.message).toBe('Perfil não encontrado');
    });

    it('deve exportar InvalidAvatarUrlException', () => {
      expect(InvalidAvatarUrlException).toBeDefined();
      const exception = new InvalidAvatarUrlException();
      expect(exception.message).toBe('URL do avatar inválida');
    });
  });

  describe('ContactService exports', () => {
    it('deve exportar ContactService', () => {
      expect(ContactService).toBeDefined();
      expect(typeof ContactService).toBe('function');
    });

    it('deve exportar contactService instance', () => {
      expect(contactService).toBeDefined();
      expect(contactService).toBeInstanceOf(ContactService);
    });

    it('deve exportar ContactNotFoundException', () => {
      expect(ContactNotFoundException).toBeDefined();
      const exception = new ContactNotFoundException();
      expect(exception.message).toBe('Contato não encontrado');
    });

    it('deve exportar ContactAlreadyExistsException', () => {
      expect(ContactAlreadyExistsException).toBeDefined();
      const exception = new ContactAlreadyExistsException();
      expect(exception.message).toBe('Este usuário já está nos seus contatos');
    });

    it('deve exportar CannotAddSelfException', () => {
      expect(CannotAddSelfException).toBeDefined();
      const exception = new CannotAddSelfException();
      expect(exception.message).toBe('Você não pode adicionar a si mesmo como contato');
    });

    it('deve exportar UserBlockedException', () => {
      expect(UserBlockedException).toBeDefined();
      const exception = new UserBlockedException();
      expect(exception.message).toBe('Este usuário está bloqueado');
    });

    it('deve exportar CannotBlockSelfException', () => {
      expect(CannotBlockSelfException).toBeDefined();
      const exception = new CannotBlockSelfException();
      expect(exception.message).toBe('Você não pode bloquear a si mesmo');
    });
  });
});
