import {
  UserWithContactInfo,
  UserSearchFilters,
  UserSearchOptions,
  UserSearchResult,
  UserPresence,
  UserStatus,
} from '@/modules/user/types/user.types';
import { UserProfile } from '@/modules/user/types/profile.types';

describe('user.types', () => {
  describe('UserStatus re-export', () => {
    it('deve exportar UserStatus enum', () => {
      expect(UserStatus).toBeDefined();
      expect(UserStatus.ONLINE).toBe('online');
      expect(UserStatus.OFFLINE).toBe('offline');
      expect(UserStatus.AWAY).toBe('away');
      expect(UserStatus.BUSY).toBe('busy');
    });
  });

  describe('UserWithContactInfo', () => {
    it('deve aceitar estrutura válida completa', () => {
      const user: UserWithContactInfo = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed_password',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        status: UserStatus.ONLINE,
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        isContact: true,
        isBlocked: false,
        isFavorite: true,
        contactNickname: 'Meu Amigo',
      };

      expect(user.id).toBe('user-123');
      expect(user.isContact).toBe(true);
      expect(user.contactNickname).toBe('Meu Amigo');
    });

    it('deve aceitar propriedades de contato opcionais', () => {
      const user: UserWithContactInfo = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed_password',
        displayName: null,
        avatarUrl: null,
        status: UserStatus.OFFLINE,
        lastSeenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(user.isContact).toBeUndefined();
      expect(user.isBlocked).toBeUndefined();
      expect(user.isFavorite).toBeUndefined();
      expect(user.contactNickname).toBeUndefined();
    });

    it('deve aceitar contactNickname null', () => {
      const user: UserWithContactInfo = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed_password',
        displayName: null,
        avatarUrl: null,
        status: UserStatus.AWAY,
        lastSeenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        contactNickname: null,
      };

      expect(user.contactNickname).toBeNull();
    });
  });

  describe('UserSearchFilters', () => {
    it('deve aceitar todos os filtros', () => {
      const filters: UserSearchFilters = {
        query: 'test',
        status: UserStatus.ONLINE,
        excludeUserId: 'user-123',
        excludeBlocked: true,
        onlyContacts: true,
      };

      expect(filters.query).toBe('test');
      expect(filters.status).toBe(UserStatus.ONLINE);
      expect(filters.excludeBlocked).toBe(true);
    });

    it('deve aceitar objeto vazio', () => {
      const filters: UserSearchFilters = {};
      expect(filters).toEqual({});
    });

    it('deve aceitar filtros parciais', () => {
      const filters: UserSearchFilters = {
        query: 'busca',
      };

      expect(filters.query).toBe('busca');
      expect(filters.status).toBeUndefined();
    });
  });

  describe('UserSearchOptions', () => {
    it('deve aceitar todas as opções', () => {
      const options: UserSearchOptions = {
        filters: { query: 'test' },
        limit: 20,
        offset: 10,
        orderBy: 'username',
        order: 'ASC',
      };

      expect(options.limit).toBe(20);
      expect(options.orderBy).toBe('username');
    });

    it('deve aceitar orderBy createdAt', () => {
      const options: UserSearchOptions = {
        orderBy: 'createdAt',
      };

      expect(options.orderBy).toBe('createdAt');
    });

    it('deve aceitar orderBy displayName', () => {
      const options: UserSearchOptions = {
        orderBy: 'displayName',
      };

      expect(options.orderBy).toBe('displayName');
    });

    it('deve aceitar orderBy lastSeenAt', () => {
      const options: UserSearchOptions = {
        orderBy: 'lastSeenAt',
      };

      expect(options.orderBy).toBe('lastSeenAt');
    });

    it('deve aceitar order ASC e DESC', () => {
      const optionsAsc: UserSearchOptions = { order: 'ASC' };
      const optionsDesc: UserSearchOptions = { order: 'DESC' };

      expect(optionsAsc.order).toBe('ASC');
      expect(optionsDesc.order).toBe('DESC');
    });

    it('deve aceitar objeto vazio', () => {
      const options: UserSearchOptions = {};
      expect(options).toEqual({});
    });
  });

  describe('UserSearchResult', () => {
    it('deve aceitar estrutura válida', () => {
      const result: UserSearchResult = {
        users: [
          {
            id: 'user-1',
            username: 'user1',
            email: 'user1@example.com',
            password: 'hashed_password',
            displayName: 'User 1',
            avatarUrl: null,
            status: UserStatus.ONLINE,
            lastSeenAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            isContact: true,
          },
        ],
        total: 1,
        hasMore: false,
      };

      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('deve aceitar lista vazia de usuários', () => {
      const result: UserSearchResult = {
        users: [],
        total: 0,
        hasMore: false,
      };

      expect(result.users).toHaveLength(0);
    });
  });

  describe('UserPresence', () => {
    it('deve aceitar estrutura válida com data', () => {
      const presence: UserPresence = {
        userId: 'user-123',
        status: UserStatus.ONLINE,
        lastSeenAt: new Date(),
      };

      expect(presence.userId).toBe('user-123');
      expect(presence.status).toBe(UserStatus.ONLINE);
      expect(presence.lastSeenAt).toBeInstanceOf(Date);
    });

    it('deve aceitar lastSeenAt null', () => {
      const presence: UserPresence = {
        userId: 'user-123',
        status: UserStatus.OFFLINE,
        lastSeenAt: null,
      };

      expect(presence.lastSeenAt).toBeNull();
    });

    it('deve aceitar todos os status', () => {
      const statuses = [UserStatus.ONLINE, UserStatus.OFFLINE, UserStatus.AWAY, UserStatus.BUSY];

      statuses.forEach((status) => {
        const presence: UserPresence = {
          userId: 'user-123',
          status,
          lastSeenAt: null,
        };
        expect(presence.status).toBe(status);
      });
    });
  });

  describe('UserProfile', () => {
    it('deve aceitar estrutura válida completa', () => {
      const profile: UserProfile = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        bio: 'Uma bio interessante',
        status: UserStatus.ONLINE,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      };

      expect(profile.id).toBe('user-123');
      expect(profile.username).toBe('testuser');
      expect(profile.bio).toBe('Uma bio interessante');
    });

    it('deve aceitar valores null para campos opcionais', () => {
      const profile: UserProfile = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: null,
        avatarUrl: null,
        bio: null,
        status: UserStatus.OFFLINE,
        lastSeenAt: null,
        createdAt: new Date(),
      };

      expect(profile.displayName).toBeNull();
      expect(profile.avatarUrl).toBeNull();
      expect(profile.bio).toBeNull();
      expect(profile.lastSeenAt).toBeNull();
    });
  });
});
