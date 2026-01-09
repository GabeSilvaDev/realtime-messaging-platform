jest.mock('@/shared/database/models/User', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('@/modules/user/models/Contact', () => {
  return {
    __esModule: true,
    default: {
      findByPk: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
      findAndCountAll: jest.fn(),
      findOrCreate: jest.fn(),
      create: jest.fn(),
      destroy: jest.fn(),
      count: jest.fn(),
    },
  };
});

jest.mock('@/shared/database/sequelize', () => ({
  __esModule: true,
  default: {},
}));

import {
  ContactRepository,
  contactRepository,
  IContactRepository,
} from '@/modules/user/repositories/ContactRepository';
import Contact from '@/modules/user/models/Contact';
import { UserStatus } from '@/shared/types';

const MockContact = Contact as jest.Mocked<typeof Contact>;

describe('ContactRepository', () => {
  let repository: ContactRepository;

  const mockContactInstance = {
    id: 'contact-id-1',
    userId: 'user-123',
    contactId: 'contact-456',
    nickname: 'Meu Amigo',
    isBlocked: false,
    isFavorite: false,
    blockedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    toJSON: jest.fn(),
    update: jest.fn(),
    contact: {
      toPublicJSON: jest.fn(),
    },
  };

  const mockContactUser = {
    id: 'contact-456',
    username: 'contactuser',
    displayName: 'Contact User',
    avatarUrl: 'https://example.com/avatar.jpg',
    status: UserStatus.ONLINE,
    lastSeenAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ContactRepository();
    mockContactInstance.toJSON.mockReturnValue({
      id: mockContactInstance.id,
      userId: mockContactInstance.userId,
      contactId: mockContactInstance.contactId,
      nickname: mockContactInstance.nickname,
      isBlocked: mockContactInstance.isBlocked,
      isFavorite: mockContactInstance.isFavorite,
      blockedAt: mockContactInstance.blockedAt,
      createdAt: mockContactInstance.createdAt,
      updatedAt: mockContactInstance.updatedAt,
    });
    mockContactInstance.contact.toPublicJSON.mockReturnValue(mockContactUser);
  });

  describe('IContactRepository interface', () => {
    it('deve implementar todos os métodos da interface', () => {
      const methods: (keyof IContactRepository)[] = [
        'findById',
        'findByUserAndContact',
        'findAllByUser',
        'findBlockedByUser',
        'findFavoritesByUser',
        'create',
        'update',
        'delete',
        'deleteByUserAndContact',
        'isBlocked',
        'isContact',
        'getStats',
        'block',
        'unblock',
      ];

      methods.forEach((method) => {
        expect(typeof repository[method]).toBe('function');
      });
    });
  });

  describe('contactRepository singleton', () => {
    it('deve exportar instância singleton', () => {
      expect(contactRepository).toBeDefined();
      expect(contactRepository).toBeInstanceOf(ContactRepository);
    });
  });

  describe('findById', () => {
    it('deve retornar contato quando encontrado', async () => {
      MockContact.findByPk.mockResolvedValue(mockContactInstance as any);

      const result = await repository.findById('contact-id-1');

      expect(MockContact.findByPk).toHaveBeenCalledWith('contact-id-1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('contact-id-1');
    });

    it('deve retornar null quando não encontrado', async () => {
      MockContact.findByPk.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUserAndContact', () => {
    it('deve retornar contato quando encontrado', async () => {
      MockContact.findOne.mockResolvedValue(mockContactInstance as any);

      const result = await repository.findByUserAndContact('user-123', 'contact-456');

      expect(MockContact.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: 'contact-456' },
      });
      expect(result).toBeDefined();
    });

    it('deve retornar null quando não encontrado', async () => {
      MockContact.findOne.mockResolvedValue(null);

      const result = await repository.findByUserAndContact('user-123', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllByUser', () => {
    it('deve retornar contatos paginados com opções padrão', async () => {
      MockContact.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockContactInstance],
      } as any);

      const result = await repository.findAllByUser('user-123');

      expect(MockContact.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
          limit: 51,
          offset: 0,
          order: [['createdAt', 'DESC']],
        })
      );
      expect(result.contacts).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('deve filtrar por isBlocked', async () => {
      MockContact.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      } as any);

      await repository.findAllByUser('user-123', {
        filters: { isBlocked: true },
      });

      expect(MockContact.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123', isBlocked: true },
        })
      );
    });

    it('deve filtrar por isFavorite', async () => {
      MockContact.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      } as any);

      await repository.findAllByUser('user-123', {
        filters: { isFavorite: true },
      });

      expect(MockContact.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123', isFavorite: true },
        })
      );
    });

    it('deve buscar por termo de pesquisa', async () => {
      MockContact.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      } as any);

      await repository.findAllByUser('user-123', {
        filters: { search: 'test' },
      });

      expect(MockContact.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({
              where: expect.any(Object),
            }),
          ]),
        })
      );
    });

    it('deve retornar hasMore true quando há mais resultados', async () => {
      const manyContacts = Array(51)
        .fill(null)
        .map((_, i) => ({
          ...mockContactInstance,
          id: `contact-${i}`,
          toJSON: jest.fn().mockReturnValue({ ...mockContactInstance, id: `contact-${i}` }),
          contact: mockContactInstance.contact,
        }));
      MockContact.findAndCountAll.mockResolvedValue({
        count: 60,
        rows: manyContacts,
      } as any);

      const result = await repository.findAllByUser('user-123', { limit: 50 });

      expect(result.hasMore).toBe(true);
      expect(result.contacts).toHaveLength(50);
    });

    it('deve usar valores padrão quando contact.toPublicJSON não está disponível', async () => {
      const contactWithoutUser = {
        ...mockContactInstance,
        contact: undefined,
        toJSON: jest.fn().mockReturnValue({
          ...mockContactInstance,
          contactId: 'contact-456',
        }),
      };
      MockContact.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [contactWithoutUser],
      } as any);

      const result = await repository.findAllByUser('user-123');

      expect(result.contacts[0]!.contact).toEqual({
        id: 'contact-456',
        username: '',
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
      });
    });
  });

  describe('findBlockedByUser', () => {
    it('deve retornar contatos bloqueados', async () => {
      const blockedContact = {
        ...mockContactInstance,
        isBlocked: true,
        blockedAt: new Date(),
      };
      MockContact.findAll.mockResolvedValue([blockedContact] as any);

      const result = await repository.findBlockedByUser('user-123');

      expect(MockContact.findAll).toHaveBeenCalledWith({
        where: { userId: 'user-123', isBlocked: true },
        include: expect.any(Array),
        order: [['blockedAt', 'DESC']],
      });
      expect(result).toHaveLength(1);
    });

    it('deve usar valores padrão quando contact não está disponível', async () => {
      const blockedContactWithoutUser = {
        ...mockContactInstance,
        isBlocked: true,
        contact: undefined,
        toJSON: jest.fn().mockReturnValue({
          ...mockContactInstance,
          isBlocked: true,
          contactId: 'contact-456',
        }),
      };
      MockContact.findAll.mockResolvedValue([blockedContactWithoutUser] as any);

      const result = await repository.findBlockedByUser('user-123');

      expect(result[0]!.contact.id).toBe('contact-456');
      expect(result[0]!.contact.status).toBe('offline');
    });
  });

  describe('findFavoritesByUser', () => {
    it('deve retornar contatos favoritos não bloqueados', async () => {
      const favoriteContact = {
        ...mockContactInstance,
        isFavorite: true,
        isBlocked: false,
      };
      MockContact.findAll.mockResolvedValue([favoriteContact] as any);

      const result = await repository.findFavoritesByUser('user-123');

      expect(MockContact.findAll).toHaveBeenCalledWith({
        where: { userId: 'user-123', isFavorite: true, isBlocked: false },
        include: expect.any(Array),
        order: [['createdAt', 'DESC']],
      });
      expect(result).toHaveLength(1);
    });

    it('deve usar valores padrão quando contact não está disponível', async () => {
      const favoriteContactWithoutUser = {
        ...mockContactInstance,
        isFavorite: true,
        contact: undefined,
        toJSON: jest.fn().mockReturnValue({
          ...mockContactInstance,
          isFavorite: true,
          contactId: 'contact-456',
        }),
      };
      MockContact.findAll.mockResolvedValue([favoriteContactWithoutUser] as any);

      const result = await repository.findFavoritesByUser('user-123');

      expect(result[0]!.contact.username).toBe('');
    });
  });

  describe('create', () => {
    it('deve criar contato com dados fornecidos', async () => {
      MockContact.create.mockResolvedValue(mockContactInstance as any);

      const createData = {
        userId: 'user-123',
        contactId: 'contact-456',
        nickname: 'Meu Amigo',
      };
      const result = await repository.create(createData);

      expect(MockContact.create).toHaveBeenCalledWith(createData);
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('deve atualizar contato existente', async () => {
      const updatedInstance = {
        ...mockContactInstance,
        nickname: 'Novo Apelido',
        toJSON: jest.fn().mockReturnValue({
          ...mockContactInstance,
          nickname: 'Novo Apelido',
        }),
        update: jest.fn(),
      };
      MockContact.findByPk.mockResolvedValue(updatedInstance as any);

      const result = await repository.update('contact-id-1', { nickname: 'Novo Apelido' });

      expect(MockContact.findByPk).toHaveBeenCalledWith('contact-id-1');
      expect(updatedInstance.update).toHaveBeenCalledWith({ nickname: 'Novo Apelido' });
      expect(result?.nickname).toBe('Novo Apelido');
    });

    it('deve retornar null quando contato não existe', async () => {
      MockContact.findByPk.mockResolvedValue(null);

      const result = await repository.update('nonexistent', { nickname: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deve retornar true quando contato deletado', async () => {
      MockContact.destroy.mockResolvedValue(1);

      const result = await repository.delete('contact-id-1');

      expect(MockContact.destroy).toHaveBeenCalledWith({ where: { id: 'contact-id-1' } });
      expect(result).toBe(true);
    });

    it('deve retornar false quando contato não encontrado', async () => {
      MockContact.destroy.mockResolvedValue(0);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteByUserAndContact', () => {
    it('deve retornar true quando contato deletado', async () => {
      MockContact.destroy.mockResolvedValue(1);

      const result = await repository.deleteByUserAndContact('user-123', 'contact-456');

      expect(MockContact.destroy).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: 'contact-456' },
      });
      expect(result).toBe(true);
    });

    it('deve retornar false quando contato não encontrado', async () => {
      MockContact.destroy.mockResolvedValue(0);

      const result = await repository.deleteByUserAndContact('user-123', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('isBlocked', () => {
    it('deve retornar true quando usuário está bloqueado', async () => {
      MockContact.findOne.mockResolvedValue({ isBlocked: true } as any);

      const result = await repository.isBlocked('user-123', 'contact-456');

      expect(MockContact.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: 'contact-456', isBlocked: true },
      });
      expect(result).toBe(true);
    });

    it('deve retornar false quando usuário não está bloqueado', async () => {
      MockContact.findOne.mockResolvedValue(null);

      const result = await repository.isBlocked('user-123', 'contact-456');

      expect(result).toBe(false);
    });
  });

  describe('isContact', () => {
    it('deve retornar true quando é contato', async () => {
      MockContact.findOne.mockResolvedValue(mockContactInstance as any);

      const result = await repository.isContact('user-123', 'contact-456');

      expect(MockContact.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: 'contact-456' },
      });
      expect(result).toBe(true);
    });

    it('deve retornar false quando não é contato', async () => {
      MockContact.findOne.mockResolvedValue(null);

      const result = await repository.isContact('user-123', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('deve retornar estatísticas de contatos', async () => {
      MockContact.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2);

      const result = await repository.getStats('user-123');

      expect(MockContact.count).toHaveBeenCalledTimes(3);
      expect(MockContact.count).toHaveBeenNthCalledWith(1, { where: { userId: 'user-123' } });
      expect(MockContact.count).toHaveBeenNthCalledWith(2, {
        where: { userId: 'user-123', isFavorite: true },
      });
      expect(MockContact.count).toHaveBeenNthCalledWith(3, {
        where: { userId: 'user-123', isBlocked: true },
      });
      expect(result).toEqual({ total: 10, favorites: 3, blocked: 2 });
    });
  });

  describe('block', () => {
    it('deve criar novo contato bloqueado quando não existe', async () => {
      const blockedContact = {
        ...mockContactInstance,
        isBlocked: true,
        blockedAt: new Date(),
        toJSON: jest.fn().mockReturnValue({
          ...mockContactInstance,
          isBlocked: true,
          blockedAt: new Date(),
        }),
        update: jest.fn(),
      };
      MockContact.findOrCreate.mockResolvedValue([blockedContact as any, true]);

      const result = await repository.block('user-123', 'contact-456');

      expect(MockContact.findOrCreate).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: 'contact-456' },
        defaults: {
          userId: 'user-123',
          contactId: 'contact-456',
          isBlocked: true,
          blockedAt: expect.any(Date),
        },
      });
      expect(result.isBlocked).toBe(true);
    });

    it('deve atualizar contato existente para bloqueado', async () => {
      const existingContact = {
        ...mockContactInstance,
        isBlocked: false,
        toJSON: jest.fn().mockReturnValue(mockContactInstance),
        update: jest.fn(),
      };
      MockContact.findOrCreate.mockResolvedValue([existingContact as any, false]);

      await repository.block('user-123', 'contact-456');

      expect(existingContact.update).toHaveBeenCalledWith({
        isBlocked: true,
        blockedAt: expect.any(Date),
      });
    });

    it('não deve atualizar se já está bloqueado', async () => {
      const alreadyBlockedContact = {
        ...mockContactInstance,
        isBlocked: true,
        toJSON: jest.fn().mockReturnValue({ ...mockContactInstance, isBlocked: true }),
        update: jest.fn(),
      };
      MockContact.findOrCreate.mockResolvedValue([alreadyBlockedContact as any, false]);

      await repository.block('user-123', 'contact-456');

      expect(alreadyBlockedContact.update).not.toHaveBeenCalled();
    });
  });

  describe('unblock', () => {
    it('deve desbloquear contato quando está bloqueado', async () => {
      const blockedContact = {
        ...mockContactInstance,
        isBlocked: true,
        update: jest.fn(),
      };
      MockContact.findOne.mockResolvedValue(blockedContact as any);

      const result = await repository.unblock('user-123', 'contact-456');

      expect(MockContact.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: 'contact-456', isBlocked: true },
      });
      expect(blockedContact.update).toHaveBeenCalledWith({
        isBlocked: false,
        blockedAt: null,
      });
      expect(result).toBe(true);
    });

    it('deve retornar false quando contato não está bloqueado', async () => {
      MockContact.findOne.mockResolvedValue(null);

      const result = await repository.unblock('user-123', 'contact-456');

      expect(result).toBe(false);
    });
  });
});
