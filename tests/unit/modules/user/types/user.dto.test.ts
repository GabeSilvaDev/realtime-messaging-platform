import {
  CreateUserDTO,
  UpdateUserDTO,
  UpdateProfileDTO,
  UserResponseDTO,
  PublicUserDTO,
  UserSearchResultDTO,
  UserListFilters,
  UserListOptions,
  PaginatedUsers,
  AddContactDTO,
  UpdateContactDTO,
  ContactResponseDTO,
  BlockUserDTO,
  UnblockUserDTO,
} from '@/modules/user/types/user.dto';
import { UserStatus } from '@/shared/types';

describe('user.dto', () => {
  describe('CreateUserDTO', () => {
    it('deve aceitar estrutura válida completa', () => {
      const dto: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test@1234',
        displayName: 'Test User',
      };

      expect(dto.username).toBe('testuser');
      expect(dto.email).toBe('test@example.com');
      expect(dto.password).toBe('Test@1234');
      expect(dto.displayName).toBe('Test User');
    });

    it('deve aceitar sem displayName', () => {
      const dto: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test@1234',
      };

      expect(dto.displayName).toBeUndefined();
    });
  });

  describe('UpdateUserDTO', () => {
    it('deve aceitar estrutura válida', () => {
      const dto: UpdateUserDTO = {
        username: 'newusername',
        displayName: 'New Display Name',
      };

      expect(dto.username).toBe('newusername');
      expect(dto.displayName).toBe('New Display Name');
    });

    it('deve aceitar displayName null', () => {
      const dto: UpdateUserDTO = {
        displayName: null,
      };

      expect(dto.displayName).toBeNull();
    });

    it('deve aceitar objeto vazio', () => {
      const dto: UpdateUserDTO = {};
      expect(dto).toEqual({});
    });
  });

  describe('UpdateProfileDTO', () => {
    it('deve aceitar estrutura válida completa', () => {
      const dto: UpdateProfileDTO = {
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        bio: 'Uma bio',
      };

      expect(dto.displayName).toBe('Test User');
      expect(dto.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(dto.bio).toBe('Uma bio');
    });

    it('deve aceitar valores null', () => {
      const dto: UpdateProfileDTO = {
        displayName: null,
        avatarUrl: null,
        bio: null,
      };

      expect(dto.displayName).toBeNull();
      expect(dto.avatarUrl).toBeNull();
      expect(dto.bio).toBeNull();
    });

    it('deve aceitar objeto vazio', () => {
      const dto: UpdateProfileDTO = {};
      expect(dto).toEqual({});
    });
  });

  describe('UserResponseDTO', () => {
    it('deve aceitar estrutura válida', () => {
      const dto: UserResponseDTO = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        status: 'online',
        lastSeenAt: new Date(),
        createdAt: new Date(),
      };

      expect(dto.id).toBe('user-123');
      expect(dto.status).toBe('online');
    });

    it('deve aceitar valores null', () => {
      const dto: UserResponseDTO = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
        createdAt: new Date(),
      };

      expect(dto.displayName).toBeNull();
      expect(dto.lastSeenAt).toBeNull();
    });
  });

  describe('PublicUserDTO', () => {
    it('deve aceitar estrutura válida', () => {
      const dto: PublicUserDTO = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        status: 'online',
        lastSeenAt: new Date(),
      };

      expect(dto.id).toBe('user-123');
      expect(dto.username).toBe('testuser');
    });

    it('deve aceitar valores null', () => {
      const dto: PublicUserDTO = {
        id: 'user-123',
        username: 'testuser',
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
      };

      expect(dto.displayName).toBeNull();
      expect(dto.avatarUrl).toBeNull();
    });
  });

  describe('UserSearchResultDTO', () => {
    it('deve aceitar estrutura válida', () => {
      const dto: UserSearchResultDTO = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        isContact: true,
        isBlocked: false,
      };

      expect(dto.isContact).toBe(true);
      expect(dto.isBlocked).toBe(false);
    });

    it('deve aceitar valores null para opcionais', () => {
      const dto: UserSearchResultDTO = {
        id: 'user-123',
        username: 'testuser',
        displayName: null,
        avatarUrl: null,
        isContact: false,
        isBlocked: false,
      };

      expect(dto.displayName).toBeNull();
    });
  });

  describe('UserListFilters', () => {
    it('deve aceitar estrutura válida', () => {
      const filters: UserListFilters = {
        search: 'termo',
        status: UserStatus.ONLINE,
        excludeIds: ['user-1', 'user-2'],
      };

      expect(filters.search).toBe('termo');
      expect(filters.status).toBe(UserStatus.ONLINE);
      expect(filters.excludeIds).toHaveLength(2);
    });

    it('deve aceitar objeto vazio', () => {
      const filters: UserListFilters = {};
      expect(filters).toEqual({});
    });

    it('deve aceitar filtros parciais', () => {
      const filters: UserListFilters = {
        search: 'test',
      };

      expect(filters.search).toBe('test');
      expect(filters.status).toBeUndefined();
    });
  });

  describe('UserListOptions', () => {
    it('deve aceitar estrutura válida completa', () => {
      const options: UserListOptions = {
        filters: { search: 'test' },
        orderBy: 'username',
        order: 'ASC',
        limit: 20,
        offset: 0,
      };

      expect(options.orderBy).toBe('username');
      expect(options.limit).toBe(20);
    });

    it('deve aceitar todos os orderBy válidos', () => {
      const orderByValues: UserListOptions['orderBy'][] = [
        'username',
        'displayName',
        'createdAt',
        'lastSeenAt',
      ];

      orderByValues.forEach((orderBy) => {
        const options: UserListOptions = { orderBy };
        expect(options.orderBy).toBe(orderBy);
      });
    });

    it('deve aceitar order ASC e DESC', () => {
      const optionsAsc: UserListOptions = { order: 'ASC' };
      const optionsDesc: UserListOptions = { order: 'DESC' };

      expect(optionsAsc.order).toBe('ASC');
      expect(optionsDesc.order).toBe('DESC');
    });

    it('deve aceitar objeto vazio', () => {
      const options: UserListOptions = {};
      expect(options).toEqual({});
    });
  });

  describe('PaginatedUsers', () => {
    it('deve aceitar estrutura válida', () => {
      const paginated: PaginatedUsers = {
        users: [
          {
            id: 'user-1',
            username: 'user1',
            displayName: 'User 1',
            avatarUrl: null,
            status: 'online',
            lastSeenAt: new Date(),
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      expect(paginated.users).toHaveLength(1);
      expect(paginated.total).toBe(1);
      expect(paginated.hasMore).toBe(false);
    });

    it('deve aceitar lista vazia', () => {
      const paginated: PaginatedUsers = {
        users: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      expect(paginated.users).toHaveLength(0);
    });
  });

  describe('AddContactDTO', () => {
    it('deve aceitar estrutura válida completa', () => {
      const dto: AddContactDTO = {
        contactId: 'user-456',
        nickname: 'Meu Amigo',
      };

      expect(dto.contactId).toBe('user-456');
      expect(dto.nickname).toBe('Meu Amigo');
    });

    it('deve aceitar sem nickname', () => {
      const dto: AddContactDTO = {
        contactId: 'user-456',
      };

      expect(dto.nickname).toBeUndefined();
    });
  });

  describe('UpdateContactDTO', () => {
    it('deve aceitar estrutura válida', () => {
      const dto: UpdateContactDTO = {
        nickname: 'Novo Apelido',
        isFavorite: true,
      };

      expect(dto.nickname).toBe('Novo Apelido');
      expect(dto.isFavorite).toBe(true);
    });

    it('deve aceitar nickname null', () => {
      const dto: UpdateContactDTO = {
        nickname: null,
      };

      expect(dto.nickname).toBeNull();
    });

    it('deve aceitar objeto vazio', () => {
      const dto: UpdateContactDTO = {};
      expect(dto).toEqual({});
    });
  });

  describe('ContactResponseDTO', () => {
    it('deve aceitar estrutura válida', () => {
      const dto: ContactResponseDTO = {
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: 'Meu Amigo',
        isBlocked: false,
        isFavorite: true,
        blockedAt: null,
        createdAt: new Date(),
        contact: {
          id: 'user-456',
          username: 'contactuser',
          displayName: 'Contact User',
          avatarUrl: 'https://example.com/avatar.jpg',
          status: 'online',
          lastSeenAt: new Date(),
        },
      };

      expect(dto.id).toBe('contact-123');
      expect(dto.contact.username).toBe('contactuser');
    });

    it('deve aceitar nickname e blockedAt null', () => {
      const dto: ContactResponseDTO = {
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: null,
        isBlocked: false,
        isFavorite: false,
        blockedAt: null,
        createdAt: new Date(),
        contact: {
          id: 'user-456',
          username: 'contactuser',
          displayName: null,
          avatarUrl: null,
          status: 'offline',
          lastSeenAt: null,
        },
      };

      expect(dto.nickname).toBeNull();
      expect(dto.blockedAt).toBeNull();
    });
  });

  describe('BlockUserDTO', () => {
    it('deve aceitar estrutura válida', () => {
      const dto: BlockUserDTO = {
        userId: 'user-456',
      };

      expect(dto.userId).toBe('user-456');
    });
  });

  describe('UnblockUserDTO', () => {
    it('deve aceitar estrutura válida', () => {
      const dto: UnblockUserDTO = {
        userId: 'user-456',
      };

      expect(dto.userId).toBe('user-456');
    });
  });
});
