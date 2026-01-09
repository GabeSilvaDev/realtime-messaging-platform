jest.mock('@/shared/database/models/User', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('@/modules/user/models/Contact', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
  },
}));

jest.mock('@/shared/database/sequelize', () => ({
  __esModule: true,
  default: {},
}));

import { UserRepository, userRepository } from '@/modules/user/repositories/UserRepository';
import User from '@/shared/database/models/User';
import Contact from '@/modules/user/models/Contact';
import { UserStatus } from '@/shared/types';
import { Op } from 'sequelize';

const MockUser = User as jest.Mocked<typeof User>;
const MockContact = Contact as jest.Mocked<typeof Contact>;

describe('UserRepository', () => {
  let repository: UserRepository;

  const mockUserInstance = {
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
    get: jest.fn().mockReturnThis(),
    update: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UserRepository();
    mockUserInstance.get.mockReturnValue(mockUserInstance);
  });

  describe('userRepository singleton', () => {
    it('deve exportar instância singleton', () => {
      expect(userRepository).toBeDefined();
      expect(userRepository).toBeInstanceOf(UserRepository);
    });
  });

  describe('findById', () => {
    it('deve retornar usuário quando encontrado', async () => {
      MockUser.findByPk.mockResolvedValue(mockUserInstance as any);

      const result = await repository.findById('user-123');

      expect(MockUser.findByPk).toHaveBeenCalledWith('user-123');
      expect(result).toBeDefined();
      expect(result?.id).toBe('user-123');
    });

    it('deve retornar null quando não encontrado', async () => {
      MockUser.findByPk.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('deve retornar usuário quando email encontrado', async () => {
      MockUser.findOne.mockResolvedValue(mockUserInstance as any);

      const result = await repository.findByEmail('TEST@EXAMPLE.COM');

      expect(MockUser.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toBeDefined();
    });

    it('deve retornar null quando email não encontrado', async () => {
      MockUser.findOne.mockResolvedValue(null);

      const result = await repository.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('deve retornar usuário quando username encontrado', async () => {
      MockUser.findOne.mockResolvedValue(mockUserInstance as any);

      const result = await repository.findByUsername('TESTUSER');

      expect(MockUser.findOne).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
      expect(result).toBeDefined();
    });

    it('deve retornar null quando username não encontrado', async () => {
      MockUser.findOne.mockResolvedValue(null);

      const result = await repository.findByUsername('notfound');

      expect(result).toBeNull();
    });
  });

  describe('findByIds', () => {
    it('deve retornar array vazio quando ids vazio', async () => {
      const result = await repository.findByIds([]);

      expect(MockUser.findAll).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('deve retornar usuários para ids fornecidos', async () => {
      const users = [
        { ...mockUserInstance, id: 'user-1', get: jest.fn().mockReturnThis() },
        { ...mockUserInstance, id: 'user-2', get: jest.fn().mockReturnThis() },
      ];
      users[0]!.get.mockReturnValue(users[0]);
      users[1]!.get.mockReturnValue(users[1]);
      MockUser.findAll.mockResolvedValue(users as any);

      const result = await repository.findByIds(['user-1', 'user-2']);

      expect(MockUser.findAll).toHaveBeenCalledWith({
        where: { id: { [Op.in]: ['user-1', 'user-2'] } },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('create', () => {
    it('deve criar usuário com dados fornecidos', async () => {
      const createData = {
        username: 'NEWUSER',
        email: 'NEW@EXAMPLE.COM',
        password: 'hashedpassword',
        displayName: 'New User',
      };
      MockUser.create.mockResolvedValue(mockUserInstance as any);

      const result = await repository.create(createData);

      expect(MockUser.create).toHaveBeenCalledWith({
        ...createData,
        email: 'new@example.com',
        username: 'newuser',
      });
      expect(result).toBeDefined();
    });

    it('deve criar usuário sem displayName', async () => {
      const createData = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'hashedpassword',
      };
      MockUser.create.mockResolvedValue(mockUserInstance as any);

      await repository.create(createData);

      expect(MockUser.create).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@example.com',
        password: 'hashedpassword',
      });
    });
  });

  describe('update', () => {
    it('deve atualizar usuário existente', async () => {
      const updatedInstance = {
        ...mockUserInstance,
        displayName: 'Updated Name',
        get: jest.fn().mockReturnValue({ ...mockUserInstance, displayName: 'Updated Name' }),
        update: jest.fn(),
      };
      MockUser.findByPk.mockResolvedValue(updatedInstance as any);

      const result = await repository.update('user-123', { displayName: 'Updated Name' });

      expect(MockUser.findByPk).toHaveBeenCalledWith('user-123');
      expect(updatedInstance.update).toHaveBeenCalledWith({ displayName: 'Updated Name' });
      expect(result).toBeDefined();
    });

    it('deve retornar null quando usuário não existe', async () => {
      MockUser.findByPk.mockResolvedValue(null);

      const result = await repository.update('nonexistent', { displayName: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('updatePassword', () => {
    it('deve atualizar senha do usuário', async () => {
      MockUser.update.mockResolvedValue([1]);

      await repository.updatePassword('user-123', 'newhashedpassword');

      expect(MockUser.update).toHaveBeenCalledWith(
        { password: 'newhashedpassword' },
        { where: { id: 'user-123' } }
      );
    });
  });

  describe('delete', () => {
    it('deve retornar true quando usuário deletado', async () => {
      MockUser.destroy.mockResolvedValue(1);

      const result = await repository.delete('user-123');

      expect(MockUser.destroy).toHaveBeenCalledWith({ where: { id: 'user-123' } });
      expect(result).toBe(true);
    });

    it('deve retornar false quando usuário não encontrado', async () => {
      MockUser.destroy.mockResolvedValue(0);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('search', () => {
    const mockSearchUsers = [
      { ...mockUserInstance, id: 'user-1', get: jest.fn() },
      { ...mockUserInstance, id: 'user-2', get: jest.fn() },
    ];

    beforeEach(() => {
      mockSearchUsers[0]!.get.mockReturnValue({ ...mockUserInstance, id: 'user-1' });
      mockSearchUsers[1]!.get.mockReturnValue({ ...mockUserInstance, id: 'user-2' });
    });

    it('deve buscar com opções padrão', async () => {
      MockUser.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: mockSearchUsers,
      } as any);
      MockContact.findAll.mockResolvedValue([]);

      const result = await repository.search({});

      expect(MockUser.findAndCountAll).toHaveBeenCalledWith({
        where: {},
        limit: 21,
        offset: 0,
        order: [['username', 'ASC']],
        attributes: { exclude: ['password'] },
      });
      expect(result.users).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('deve buscar com query de texto', async () => {
      MockUser.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSearchUsers[0]],
      } as any);
      MockContact.findAll.mockResolvedValue([]);

      await repository.search({ filters: { query: 'test' } });

      expect(MockUser.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            [Op.or]: expect.any(Array),
          }),
        })
      );
    });

    it('deve buscar com filtro de status', async () => {
      MockUser.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSearchUsers[0]],
      } as any);
      MockContact.findAll.mockResolvedValue([]);

      await repository.search({ filters: { status: UserStatus.ONLINE } });

      expect(MockUser.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: UserStatus.ONLINE,
          }),
        })
      );
    });

    it('deve buscar excluindo userId específico', async () => {
      MockUser.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSearchUsers[0]],
      } as any);
      MockContact.findAll.mockResolvedValue([]);

      await repository.search({ filters: { excludeUserId: 'user-exclude' } });

      expect(MockUser.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { [Op.ne]: 'user-exclude' },
          }),
        })
      );
      expect(MockContact.findAll).toHaveBeenCalledWith({
        where: { userId: 'user-exclude' },
      });
    });

    it('deve retornar hasMore true quando há mais resultados', async () => {
      const manyUsers = Array(21)
        .fill(null)
        .map((_, i) => ({
          ...mockUserInstance,
          id: `user-${i}`,
          get: jest.fn().mockReturnValue({ ...mockUserInstance, id: `user-${i}` }),
        }));
      MockUser.findAndCountAll.mockResolvedValue({
        count: 25,
        rows: manyUsers,
      } as any);
      MockContact.findAll.mockResolvedValue([]);

      const result = await repository.search({ limit: 20 });

      expect(result.hasMore).toBe(true);
      expect(result.users).toHaveLength(20);
    });

    it('deve filtrar usuários bloqueados quando excludeBlocked=true', async () => {
      const usersWithBlocked = [
        { ...mockSearchUsers[0], get: jest.fn().mockReturnValue({ ...mockUserInstance, id: 'user-1' }) },
        { ...mockSearchUsers[1], get: jest.fn().mockReturnValue({ ...mockUserInstance, id: 'user-2' }) },
      ];
      MockUser.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: usersWithBlocked,
      } as any);
      MockContact.findAll.mockResolvedValue([
        { contactId: 'user-1', isBlocked: true, isFavorite: false, nickname: null },
      ] as any);

      const result = await repository.search({
        filters: { excludeUserId: 'me', excludeBlocked: true },
      });

      expect(result.users.find((u) => u.id === 'user-1')).toBeUndefined();
    });

    it('deve filtrar apenas contatos quando onlyContacts=true', async () => {
      const usersWithContacts = [
        { ...mockSearchUsers[0], get: jest.fn().mockReturnValue({ ...mockUserInstance, id: 'user-1' }) },
        { ...mockSearchUsers[1], get: jest.fn().mockReturnValue({ ...mockUserInstance, id: 'user-2' }) },
      ];
      MockUser.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: usersWithContacts,
      } as any);
      MockContact.findAll.mockResolvedValue([
        { contactId: 'user-1', isBlocked: false, isFavorite: true, nickname: 'Amigo' },
      ] as any);

      const result = await repository.search({
        filters: { excludeUserId: 'me', onlyContacts: true },
      });

      expect(result.users).toHaveLength(1);
      expect(result.users[0]!.id).toBe('user-1');
      expect(result.users[0]!.isContact).toBe(true);
      expect(result.users[0]!.isFavorite).toBe(true);
      expect(result.users[0]!.contactNickname).toBe('Amigo');
    });

    it('deve adicionar informações de contato aos resultados', async () => {
      MockUser.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ ...mockSearchUsers[0], get: jest.fn().mockReturnValue({ ...mockUserInstance, id: 'user-1' }) }],
      } as any);
      MockContact.findAll.mockResolvedValue([
        { contactId: 'user-1', isBlocked: false, isFavorite: true, nickname: 'Meu Amigo' },
      ] as any);

      const result = await repository.search({ filters: { excludeUserId: 'me' } });

      expect(result.users[0]!.isContact).toBe(true);
      expect(result.users[0]!.isBlocked).toBe(false);
      expect(result.users[0]!.isFavorite).toBe(true);
      expect(result.users[0]!.contactNickname).toBe('Meu Amigo');
    });

    it('deve respeitar ordenação customizada', async () => {
      MockUser.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      } as any);
      MockContact.findAll.mockResolvedValue([]);

      await repository.search({
        orderBy: 'createdAt',
        order: 'DESC',
      });

      expect(MockUser.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['createdAt', 'DESC']],
        })
      );
    });
  });

  describe('updateLastSeen', () => {
    it('deve atualizar lastSeenAt do usuário', async () => {
      MockUser.update.mockResolvedValue([1]);

      await repository.updateLastSeen('user-123');

      expect(MockUser.update).toHaveBeenCalledWith(
        { lastSeenAt: expect.any(Date) },
        { where: { id: 'user-123' } }
      );
    });
  });

  describe('updateStatus', () => {
    it('deve atualizar status e lastSeenAt do usuário', async () => {
      MockUser.update.mockResolvedValue([1]);

      await repository.updateStatus('user-123', UserStatus.BUSY);

      expect(MockUser.update).toHaveBeenCalledWith(
        { status: UserStatus.BUSY, lastSeenAt: expect.any(Date) },
        { where: { id: 'user-123' } }
      );
    });
  });
});
