jest.mock('@/shared/database', () => ({
  sequelize: { models: {} },
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

jest.mock('@/modules/user/repositories', () => ({
  contactRepository: {
    findById: jest.fn(),
    findByUserAndContact: jest.fn(),
    findAllByUser: jest.fn(),
    findBlockedByUser: jest.fn(),
    findFavoritesByUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteByUserAndContact: jest.fn(),
    isBlocked: jest.fn(),
    isContact: jest.fn(),
    getStats: jest.fn(),
    block: jest.fn(),
    unblock: jest.fn(),
  },
  userRepository: {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findByIds: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    search: jest.fn(),
    updateLastSeen: jest.fn(),
    updateStatus: jest.fn(),
  },
  ContactRepository: jest.fn(),
  UserRepository: jest.fn(),
}));

import {
  ContactService,
  ContactNotFoundException,
  UserNotFoundException,
  ContactAlreadyExistsException,
  CannotAddSelfException,
  UserBlockedException,
  CannotBlockSelfException,
} from '@/modules/user/services/ContactService';
import { contactRepository, userRepository } from '@/modules/user/repositories';
import { UserStatus } from '@/shared/types';
import { HttpStatus, ErrorCode } from '@/shared/errors';

const mockContactRepository = contactRepository as jest.Mocked<typeof contactRepository>;
const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;

describe('ContactService', () => {
  let contactService: ContactService;

  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword',
    displayName: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
    status: UserStatus.ONLINE,
    lastSeenAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockContactUser = {
    ...mockUser,
    id: 'contact-456',
    username: 'contactuser',
    email: 'contact@example.com',
    displayName: 'Contact User',
  };

  const mockContact = {
    id: 'contact-id-1',
    userId: 'user-123',
    contactId: 'contact-456',
    nickname: 'Meu Amigo',
    isBlocked: false,
    isFavorite: false,
    blockedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    contactService = new ContactService(mockContactRepository, mockUserRepository);
  });

  describe('ContactNotFoundException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new ContactNotFoundException();
      expect(exception.message).toBe('Contato não encontrado');
      expect(exception.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(exception.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('deve criar exceção com mensagem personalizada', () => {
      const exception = new ContactNotFoundException('Contato específico não encontrado');
      expect(exception.message).toBe('Contato específico não encontrado');
    });
  });

  describe('UserNotFoundException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new UserNotFoundException();
      expect(exception.message).toBe('Usuário não encontrado');
      expect(exception.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(exception.code).toBe(ErrorCode.USER_NOT_FOUND);
    });
  });

  describe('ContactAlreadyExistsException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new ContactAlreadyExistsException();
      expect(exception.message).toBe('Este usuário já está nos seus contatos');
      expect(exception.statusCode).toBe(HttpStatus.CONFLICT);
      expect(exception.code).toBe(ErrorCode.DUPLICATE_ENTRY);
    });
  });

  describe('CannotAddSelfException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new CannotAddSelfException();
      expect(exception.message).toBe('Você não pode adicionar a si mesmo como contato');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('UserBlockedException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new UserBlockedException();
      expect(exception.message).toBe('Este usuário está bloqueado');
      expect(exception.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(exception.code).toBe(ErrorCode.USER_BLOCKED);
    });
  });

  describe('CannotBlockSelfException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new CannotBlockSelfException();
      expect(exception.message).toBe('Você não pode bloquear a si mesmo');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('addContact', () => {
    it('deve adicionar contato com sucesso', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.isBlocked.mockResolvedValue(false);
      mockContactRepository.create.mockResolvedValue(mockContact);

      const result = await contactService.addContact('user-123', {
        contactId: 'contact-456',
        nickname: 'Meu Amigo',
      });

      expect(mockUserRepository.findById).toHaveBeenCalledWith('contact-456');
      expect(mockContactRepository.findByUserAndContact).toHaveBeenCalledWith(
        'user-123',
        'contact-456'
      );
      expect(mockContactRepository.isBlocked).toHaveBeenCalledWith('user-123', 'contact-456');
      expect(mockContactRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        contactId: 'contact-456',
        nickname: 'Meu Amigo',
      });
      expect(result.contact.username).toBe('contactuser');
    });

    it('deve adicionar contato sem nickname', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.isBlocked.mockResolvedValue(false);
      mockContactRepository.create.mockResolvedValue({ ...mockContact, nickname: null });

      const result = await contactService.addContact('user-123', {
        contactId: 'contact-456',
      });

      expect(mockContactRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        contactId: 'contact-456',
        nickname: null,
      });
      expect(result).toBeDefined();
    });

    it('deve lançar CannotAddSelfException ao adicionar a si mesmo', async () => {
      await expect(
        contactService.addContact('user-123', { contactId: 'user-123' })
      ).rejects.toThrow(CannotAddSelfException);
    });

    it('deve lançar UserNotFoundException quando usuário de contato não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        contactService.addContact('user-123', { contactId: 'nonexistent' })
      ).rejects.toThrow(UserNotFoundException);
    });

    it('deve lançar ContactAlreadyExistsException quando contato já existe', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);

      await expect(
        contactService.addContact('user-123', { contactId: 'contact-456' })
      ).rejects.toThrow(ContactAlreadyExistsException);
    });

    it('deve lançar UserBlockedException quando usuário está bloqueado', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.isBlocked.mockResolvedValue(true);

      await expect(
        contactService.addContact('user-123', { contactId: 'contact-456' })
      ).rejects.toThrow(UserBlockedException);
    });
  });

  describe('updateContact', () => {
    it('deve atualizar contato com sucesso', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.update.mockResolvedValue({
        ...mockContact,
        nickname: 'Novo Apelido',
        isFavorite: true,
      });

      const result = await contactService.updateContact('user-123', 'contact-456', {
        nickname: 'Novo Apelido',
        isFavorite: true,
      });

      expect(mockContactRepository.update).toHaveBeenCalledWith('contact-id-1', {
        nickname: 'Novo Apelido',
        isFavorite: true,
      });
      expect(result.nickname).toBe('Novo Apelido');
    });

    it('deve lançar ContactNotFoundException quando contato não existe', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);

      await expect(
        contactService.updateContact('user-123', 'nonexistent', { nickname: 'Test' })
      ).rejects.toThrow(ContactNotFoundException);
    });

    it('deve lançar UserNotFoundException quando usuário do contato não existe', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        contactService.updateContact('user-123', 'contact-456', { nickname: 'Test' })
      ).rejects.toThrow(UserNotFoundException);
    });

    it('deve lançar ContactNotFoundException quando update retorna null', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.update.mockResolvedValue(null);

      await expect(
        contactService.updateContact('user-123', 'contact-456', { nickname: 'Test' })
      ).rejects.toThrow(ContactNotFoundException);
    });
  });

  describe('removeContact', () => {
    it('deve remover contato com sucesso', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockContactRepository.delete.mockResolvedValue(true);

      await contactService.removeContact('user-123', 'contact-456');

      expect(mockContactRepository.delete).toHaveBeenCalledWith('contact-id-1');
    });

    it('deve lançar ContactNotFoundException quando contato não existe', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);

      await expect(contactService.removeContact('user-123', 'nonexistent')).rejects.toThrow(
        ContactNotFoundException
      );
    });
  });

  describe('getContact', () => {
    it('deve retornar contato com sucesso', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockUserRepository.findById.mockResolvedValue(mockContactUser);

      const result = await contactService.getContact('user-123', 'contact-456');

      expect(result.id).toBe(mockContact.id);
      expect(result.contact.username).toBe('contactuser');
    });

    it('deve lançar ContactNotFoundException quando contato não existe', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);

      await expect(contactService.getContact('user-123', 'nonexistent')).rejects.toThrow(
        ContactNotFoundException
      );
    });

    it('deve lançar UserNotFoundException quando usuário do contato não existe', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(contactService.getContact('user-123', 'contact-456')).rejects.toThrow(
        UserNotFoundException
      );
    });
  });

  describe('listContacts', () => {
    it('deve listar contatos com opções padrão', async () => {
      const paginatedContacts = {
        contacts: [{ ...mockContact, contact: mockContactUser }],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockContactRepository.findAllByUser.mockResolvedValue(paginatedContacts);

      const result = await contactService.listContacts('user-123');

      expect(mockContactRepository.findAllByUser).toHaveBeenCalledWith('user-123', {});
      expect(result.contacts).toHaveLength(1);
    });

    it('deve listar contatos com filtros', async () => {
      const paginatedContacts = {
        contacts: [],
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false,
      };
      mockContactRepository.findAllByUser.mockResolvedValue(paginatedContacts);

      const options = { filters: { isFavorite: true }, limit: 10 };
      await contactService.listContacts('user-123', options);

      expect(mockContactRepository.findAllByUser).toHaveBeenCalledWith('user-123', options);
    });
  });

  describe('listFavorites', () => {
    it('deve listar favoritos', async () => {
      const favorites = [{ ...mockContact, isFavorite: true, contact: mockContactUser }];
      mockContactRepository.findFavoritesByUser.mockResolvedValue(favorites);

      const result = await contactService.listFavorites('user-123');

      expect(mockContactRepository.findFavoritesByUser).toHaveBeenCalledWith('user-123');
      expect(result).toHaveLength(1);
    });
  });

  describe('setFavorite', () => {
    it('deve marcar contato como favorito', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.update.mockResolvedValue({ ...mockContact, isFavorite: true });

      const result = await contactService.setFavorite('user-123', 'contact-456', true);

      expect(result.isFavorite).toBe(true);
    });

    it('deve desmarcar contato como favorito', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue({
        ...mockContact,
        isFavorite: true,
      });
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.update.mockResolvedValue({ ...mockContact, isFavorite: false });

      const result = await contactService.setFavorite('user-123', 'contact-456', false);

      expect(result.isFavorite).toBe(false);
    });
  });

  describe('setNickname', () => {
    it('deve definir apelido do contato', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.update.mockResolvedValue({
        ...mockContact,
        nickname: 'Novo Apelido',
      });

      const result = await contactService.setNickname('user-123', 'contact-456', 'Novo Apelido');

      expect(result.nickname).toBe('Novo Apelido');
    });

    it('deve remover apelido do contato', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.update.mockResolvedValue({ ...mockContact, nickname: null });

      const result = await contactService.setNickname('user-123', 'contact-456', null);

      expect(result.nickname).toBeNull();
    });
  });

  describe('blockUser', () => {
    it('deve bloquear usuário com sucesso', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.block.mockResolvedValue({
        ...mockContact,
        isBlocked: true,
        blockedAt: new Date(),
      });

      await contactService.blockUser('user-123', 'contact-456');

      expect(mockContactRepository.block).toHaveBeenCalledWith('user-123', 'contact-456');
    });

    it('deve lançar CannotBlockSelfException ao bloquear a si mesmo', async () => {
      await expect(contactService.blockUser('user-123', 'user-123')).rejects.toThrow(
        CannotBlockSelfException
      );
    });

    it('deve lançar UserNotFoundException quando usuário alvo não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(contactService.blockUser('user-123', 'nonexistent')).rejects.toThrow(
        UserNotFoundException
      );
    });
  });

  describe('unblockUser', () => {
    it('deve desbloquear usuário com sucesso', async () => {
      mockContactRepository.unblock.mockResolvedValue(true);

      await contactService.unblockUser('user-123', 'contact-456');

      expect(mockContactRepository.unblock).toHaveBeenCalledWith('user-123', 'contact-456');
    });

    it('deve lançar ContactNotFoundException quando contato não está bloqueado', async () => {
      mockContactRepository.unblock.mockResolvedValue(false);

      await expect(contactService.unblockUser('user-123', 'contact-456')).rejects.toThrow(
        ContactNotFoundException
      );
    });
  });

  describe('listBlocked', () => {
    it('deve listar usuários bloqueados', async () => {
      const blockedContacts = [
        { ...mockContact, isBlocked: true, contact: mockContactUser },
      ];
      mockContactRepository.findBlockedByUser.mockResolvedValue(blockedContacts);

      const result = await contactService.listBlocked('user-123');

      expect(mockContactRepository.findBlockedByUser).toHaveBeenCalledWith('user-123');
      expect(result).toHaveLength(1);
    });
  });

  describe('isBlocked', () => {
    it('deve retornar true quando usuário está bloqueado', async () => {
      mockContactRepository.isBlocked.mockResolvedValue(true);

      const result = await contactService.isBlocked('user-123', 'contact-456');

      expect(result).toBe(true);
    });

    it('deve retornar false quando usuário não está bloqueado', async () => {
      mockContactRepository.isBlocked.mockResolvedValue(false);

      const result = await contactService.isBlocked('user-123', 'contact-456');

      expect(result).toBe(false);
    });
  });

  describe('isBlockedByEither', () => {
    it('deve retornar true quando userId bloqueou targetId', async () => {
      mockContactRepository.isBlocked
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await contactService.isBlockedByEither('user-123', 'contact-456');

      expect(result).toBe(true);
    });

    it('deve retornar true quando targetId bloqueou userId', async () => {
      mockContactRepository.isBlocked
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await contactService.isBlockedByEither('user-123', 'contact-456');

      expect(result).toBe(true);
    });

    it('deve retornar false quando nenhum bloqueou o outro', async () => {
      mockContactRepository.isBlocked.mockResolvedValue(false);

      const result = await contactService.isBlockedByEither('user-123', 'contact-456');

      expect(result).toBe(false);
    });

    it('deve retornar true quando ambos se bloquearam', async () => {
      mockContactRepository.isBlocked.mockResolvedValue(true);

      const result = await contactService.isBlockedByEither('user-123', 'contact-456');

      expect(result).toBe(true);
    });
  });

  describe('isContact', () => {
    it('deve retornar true quando é contato', async () => {
      mockContactRepository.isContact.mockResolvedValue(true);

      const result = await contactService.isContact('user-123', 'contact-456');

      expect(result).toBe(true);
    });

    it('deve retornar false quando não é contato', async () => {
      mockContactRepository.isContact.mockResolvedValue(false);

      const result = await contactService.isContact('user-123', 'contact-456');

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('deve retornar estatísticas de contatos', async () => {
      const stats = { total: 10, favorites: 3, blocked: 2 };
      mockContactRepository.getStats.mockResolvedValue(stats);

      const result = await contactService.getStats('user-123');

      expect(mockContactRepository.getStats).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(stats);
    });
  });

  describe('searchUsers', () => {
    it('deve buscar usuários com opções padrão', async () => {
      const searchResult = {
        users: [mockContactUser],
        total: 1,
        hasMore: false,
      };
      mockUserRepository.search.mockResolvedValue(searchResult);

      const result = await contactService.searchUsers('user-123', 'test');

      expect(mockUserRepository.search).toHaveBeenCalledWith({
        filters: {
          query: 'test',
          excludeUserId: 'user-123',
          excludeBlocked: true,
        },
        limit: 20,
      });
      expect(result).toHaveLength(1);
    });

    it('deve buscar usuários com opções personalizadas', async () => {
      const searchResult = {
        users: [mockContactUser],
        total: 1,
        hasMore: false,
      };
      mockUserRepository.search.mockResolvedValue(searchResult);

      await contactService.searchUsers('user-123', 'test', {
        limit: 10,
        excludeBlocked: false,
      });

      expect(mockUserRepository.search).toHaveBeenCalledWith({
        filters: {
          query: 'test',
          excludeUserId: 'user-123',
          excludeBlocked: false,
        },
        limit: 10,
      });
    });

    it('deve converter campos undefined para null no toPublicUser', async () => {
      const userWithUndefinedFields = {
        id: 'user-789',
        username: 'undefineduser',
        email: 'undefined@example.com',
        password: 'hashedpassword',
        displayName: undefined,
        avatarUrl: undefined,
        status: UserStatus.OFFLINE,
        lastSeenAt: undefined,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      const searchResult = {
        users: [userWithUndefinedFields],
        total: 1,
        hasMore: false,
      };
      mockUserRepository.search.mockResolvedValue(searchResult as any);

      const result = await contactService.searchUsers('user-123', 'test');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'user-789',
        username: 'undefineduser',
        displayName: null,
        avatarUrl: null,
        status: UserStatus.OFFLINE,
        lastSeenAt: null,
      });
    });
  });
});
