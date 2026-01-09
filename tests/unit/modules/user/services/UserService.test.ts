jest.mock('@/shared/database', () => ({
  sequelize: { models: {} },
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

jest.mock('@/modules/user/repositories', () => ({
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
  UserRepository: jest.fn(),
}));

jest.mock('@/modules/auth/services/PasswordService', () => ({
  PasswordService: jest.fn().mockImplementation(() => ({
    hash: jest.fn(),
    compare: jest.fn(),
  })),
}));

import {
  UserService,
  UserNotFoundException,
  EmailAlreadyExistsException,
  UsernameAlreadyExistsException,
  CannotDeleteSelfException,
} from '@/modules/user/services/UserService';
import { userRepository } from '@/modules/user/repositories';
import { PasswordService } from '@/modules/auth/services/PasswordService';
import { UserStatus } from '@/shared/types';
import { HttpStatus, ErrorCode } from '@/shared/errors';

const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;
const MockPasswordService = PasswordService as jest.MockedClass<typeof PasswordService>;

describe('UserService', () => {
  let userService: UserService;
  let mockPasswordService: jest.Mocked<PasswordService>;

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

  beforeEach(() => {
    jest.clearAllMocks();
    mockPasswordService = {
      hash: jest.fn(),
      compare: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;
    MockPasswordService.mockImplementation(() => mockPasswordService);
    userService = new UserService(mockUserRepository, mockPasswordService);
  });

  describe('UserNotFoundException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new UserNotFoundException();
      expect(exception.message).toBe('Usuário não encontrado');
      expect(exception.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(exception.code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('deve criar exceção com mensagem personalizada', () => {
      const exception = new UserNotFoundException('Usuário específico não encontrado');
      expect(exception.message).toBe('Usuário específico não encontrado');
    });
  });

  describe('EmailAlreadyExistsException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new EmailAlreadyExistsException();
      expect(exception.message).toBe('Email já está em uso');
      expect(exception.statusCode).toBe(HttpStatus.CONFLICT);
      expect(exception.code).toBe(ErrorCode.EMAIL_ALREADY_EXISTS);
    });

    it('deve criar exceção com mensagem personalizada', () => {
      const exception = new EmailAlreadyExistsException('Este email já existe');
      expect(exception.message).toBe('Este email já existe');
    });
  });

  describe('UsernameAlreadyExistsException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new UsernameAlreadyExistsException();
      expect(exception.message).toBe('Username já está em uso');
      expect(exception.statusCode).toBe(HttpStatus.CONFLICT);
      expect(exception.code).toBe(ErrorCode.USERNAME_ALREADY_EXISTS);
    });

    it('deve criar exceção com mensagem personalizada', () => {
      const exception = new UsernameAlreadyExistsException('Username já utilizado');
      expect(exception.message).toBe('Username já utilizado');
    });
  });

  describe('CannotDeleteSelfException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new CannotDeleteSelfException();
      expect(exception.message).toBe('Não é possível excluir sua própria conta por esta rota');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('deve criar exceção com mensagem personalizada', () => {
      const exception = new CannotDeleteSelfException('Operação não permitida');
      expect(exception.message).toBe('Operação não permitida');
    });
  });

  describe('findById', () => {
    it('deve retornar usuário quando encontrado', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.findById('user-123');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({
        id: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        displayName: mockUser.displayName,
        avatarUrl: mockUser.avatarUrl,
        status: mockUser.status,
        lastSeenAt: mockUser.lastSeenAt,
        createdAt: mockUser.createdAt,
      });
    });

    it('deve lançar UserNotFoundException quando usuário não encontrado', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.findById('nonexistent')).rejects.toThrow(UserNotFoundException);
    });
  });

  describe('findByIdPublic', () => {
    it('deve retornar dados públicos do usuário quando encontrado', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.findByIdPublic('user-123');

      expect(result).toEqual({
        id: mockUser.id,
        username: mockUser.username,
        displayName: mockUser.displayName,
        avatarUrl: mockUser.avatarUrl,
        status: mockUser.status,
        lastSeenAt: mockUser.lastSeenAt,
      });
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('password');
    });

    it('deve lançar UserNotFoundException quando usuário não encontrado', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.findByIdPublic('nonexistent')).rejects.toThrow(UserNotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('deve retornar usuário quando email encontrado', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      const result = await userService.findByEmail('TEST@EXAMPLE.COM');

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toBeDefined();
      expect(result?.email).toBe(mockUser.email);
    });

    it('deve retornar null quando email não encontrado', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await userService.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('deve retornar dados públicos do usuário quando username encontrado', async () => {
      mockUserRepository.findByUsername.mockResolvedValue(mockUser);

      const result = await userService.findByUsername('TESTUSER');

      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith('testuser');
      expect(result).toBeDefined();
      expect(result?.username).toBe(mockUser.username);
      expect(result).not.toHaveProperty('email');
    });

    it('deve retornar null quando username não encontrado', async () => {
      mockUserRepository.findByUsername.mockResolvedValue(null);

      const result = await userService.findByUsername('notfound');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const createData = {
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'Password123!',
      displayName: 'New User',
    };

    it('deve criar usuário com sucesso', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockPasswordService.hash.mockResolvedValue('hashedpassword');
      mockUserRepository.create.mockResolvedValue({
        ...mockUser,
        ...createData,
        password: 'hashedpassword',
      });

      const result = await userService.create(createData);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('newuser@example.com');
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith('newuser');
      expect(mockPasswordService.hash).toHaveBeenCalledWith('Password123!');
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        ...createData,
        password: 'hashedpassword',
      });
      expect(result).toBeDefined();
    });

    it('deve lançar EmailAlreadyExistsException quando email já existe', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockUserRepository.findByUsername.mockResolvedValue(null);

      await expect(userService.create(createData)).rejects.toThrow(EmailAlreadyExistsException);
    });

    it('deve lançar UsernameAlreadyExistsException quando username já existe', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(mockUser);

      await expect(userService.create(createData)).rejects.toThrow(UsernameAlreadyExistsException);
    });
  });

  describe('update', () => {
    const updateData = {
      username: 'updateduser',
      displayName: 'Updated Name',
    };

    it('deve atualizar usuário com sucesso', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        ...updateData,
        username: 'updateduser',
      });

      const result = await userService.update('user-123', updateData);

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', {
        ...updateData,
        username: 'updateduser',
      });
      expect(result).toBeDefined();
    });

    it('deve lançar UserNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.update('nonexistent', updateData)).rejects.toThrow(
        UserNotFoundException
      );
    });

    it('deve lançar UsernameAlreadyExistsException quando novo username já existe', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.findByUsername.mockResolvedValue({ ...mockUser, id: 'other-user' });

      await expect(userService.update('user-123', updateData)).rejects.toThrow(
        UsernameAlreadyExistsException
      );
    });

    it('deve permitir manter o mesmo username', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(mockUser);

      await userService.update('user-123', { username: 'TESTUSER' });

      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled();
    });

    it('deve lançar UserNotFoundException quando update retorna null', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockUserRepository.update.mockResolvedValue(null);

      await expect(userService.update('user-123', updateData)).rejects.toThrow(
        UserNotFoundException
      );
    });

    it('deve atualizar apenas displayName sem verificar username', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        displayName: 'New Display Name',
      });

      const result = await userService.update('user-123', { displayName: 'New Display Name' });

      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled();
      expect(result.displayName).toBe('New Display Name');
    });
  });

  describe('delete', () => {
    it('deve deletar usuário com sucesso', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.delete.mockResolvedValue(true);

      await userService.delete('user-123');

      expect(mockUserRepository.delete).toHaveBeenCalledWith('user-123');
    });

    it('deve lançar CannotDeleteSelfException quando tenta deletar própria conta', async () => {
      await expect(userService.delete('user-123', 'user-123')).rejects.toThrow(
        CannotDeleteSelfException
      );
    });

    it('deve lançar UserNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.delete('nonexistent')).rejects.toThrow(UserNotFoundException);
    });

    it('deve lançar UserNotFoundException quando delete retorna false', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.delete.mockResolvedValue(false);

      await expect(userService.delete('user-123')).rejects.toThrow(UserNotFoundException);
    });

    it('deve permitir deletar outro usuário', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.delete.mockResolvedValue(true);

      await userService.delete('user-123', 'other-user');

      expect(mockUserRepository.delete).toHaveBeenCalledWith('user-123');
    });
  });

  describe('search', () => {
    it('deve retornar resultados da busca', async () => {
      const searchResult = {
        users: [mockUser],
        total: 1,
        hasMore: false,
      };
      mockUserRepository.search.mockResolvedValue(searchResult);

      const options = { filters: { query: 'test' }, limit: 10 };
      const result = await userService.search(options);

      expect(mockUserRepository.search).toHaveBeenCalledWith(options);
      expect(result).toEqual(searchResult);
    });
  });

  describe('list', () => {
    it('deve listar usuários com opções padrão', async () => {
      const searchResult = {
        users: [mockUser],
        total: 1,
        hasMore: false,
      };
      mockUserRepository.search.mockResolvedValue(searchResult);

      const result = await userService.list();

      expect(mockUserRepository.search).toHaveBeenCalledWith({
        filters: {
          query: undefined,
          status: undefined,
          excludeUserId: undefined,
        },
        limit: 20,
        offset: 0,
        orderBy: 'username',
        order: 'ASC',
      });
      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('deve listar usuários com filtros personalizados', async () => {
      const searchResult = {
        users: [mockUser],
        total: 1,
        hasMore: true,
      };
      mockUserRepository.search.mockResolvedValue(searchResult);

      const options = {
        filters: {
          search: 'test',
          status: UserStatus.ONLINE,
          excludeIds: ['user-456'],
        },
        orderBy: 'createdAt' as const,
        order: 'DESC' as const,
        limit: 10,
        offset: 5,
      };

      const result = await userService.list(options);

      expect(mockUserRepository.search).toHaveBeenCalledWith({
        filters: {
          query: 'test',
          status: UserStatus.ONLINE,
          excludeUserId: 'user-456',
        },
        limit: 10,
        offset: 5,
        orderBy: 'createdAt',
        order: 'DESC',
      });
      expect(result.hasMore).toBe(true);
    });
  });

  describe('exists', () => {
    it('deve retornar true quando usuário existe', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.exists('user-123');

      expect(result).toBe(true);
    });

    it('deve retornar false quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      const result = await userService.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('updateLastSeen', () => {
    it('deve atualizar lastSeenAt do usuário', async () => {
      mockUserRepository.updateLastSeen.mockResolvedValue();

      await userService.updateLastSeen('user-123');

      expect(mockUserRepository.updateLastSeen).toHaveBeenCalledWith('user-123');
    });
  });

  describe('updateStatus', () => {
    it('deve atualizar status do usuário', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();

      await userService.updateStatus('user-123', UserStatus.AWAY);

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.AWAY);
    });
  });

  describe('getMultiple', () => {
    it('deve retornar múltiplos usuários', async () => {
      const users = [mockUser, { ...mockUser, id: 'user-456', username: 'user2' }];
      mockUserRepository.findByIds.mockResolvedValue(users);

      const result = await userService.getMultiple(['user-123', 'user-456']);

      expect(mockUserRepository.findByIds).toHaveBeenCalledWith(['user-123', 'user-456']);
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('email');
      expect(result[0]).not.toHaveProperty('password');
    });

    it('deve retornar array vazio quando nenhum id fornecido', async () => {
      mockUserRepository.findByIds.mockResolvedValue([]);

      const result = await userService.getMultiple([]);

      expect(result).toEqual([]);
    });
  });
});
