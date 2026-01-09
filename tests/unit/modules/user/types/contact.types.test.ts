import {
  ContactAttributes,
  ContactCreationAttributes,
  ContactWithUser,
  ContactListFilters,
  ContactListOptions,
  PaginatedContacts,
  BlockedUser,
  ContactStats,
} from '@/modules/user/types/contact.types';

describe('contact.types', () => {
  describe('ContactAttributes', () => {
    it('deve aceitar estrutura válida completa', () => {
      const contact: ContactAttributes = {
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: 'Meu Amigo',
        isBlocked: false,
        isFavorite: true,
        blockedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(contact.id).toBe('contact-123');
      expect(contact.userId).toBe('user-123');
      expect(contact.isBlocked).toBe(false);
      expect(contact.isFavorite).toBe(true);
    });

    it('deve aceitar nickname null', () => {
      const contact: ContactAttributes = {
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: null,
        isBlocked: false,
        isFavorite: false,
        blockedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(contact.nickname).toBeNull();
    });

    it('deve aceitar blockedAt com data quando bloqueado', () => {
      const blockedAt = new Date();
      const contact: ContactAttributes = {
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: null,
        isBlocked: true,
        isFavorite: false,
        blockedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(contact.isBlocked).toBe(true);
      expect(contact.blockedAt).toBe(blockedAt);
    });
  });

  describe('ContactCreationAttributes', () => {
    it('deve aceitar atributos obrigatórios', () => {
      const attrs: ContactCreationAttributes = {
        userId: 'user-123',
        contactId: 'user-456',
      };

      expect(attrs.userId).toBe('user-123');
      expect(attrs.contactId).toBe('user-456');
    });

    it('deve aceitar todos os atributos opcionais', () => {
      const attrs: ContactCreationAttributes = {
        userId: 'user-123',
        contactId: 'user-456',
        nickname: 'Apelido',
        isBlocked: false,
        isFavorite: true,
        blockedAt: null,
      };

      expect(attrs.nickname).toBe('Apelido');
      expect(attrs.isFavorite).toBe(true);
    });

    it('deve aceitar nickname null', () => {
      const attrs: ContactCreationAttributes = {
        userId: 'user-123',
        contactId: 'user-456',
        nickname: null,
      };

      expect(attrs.nickname).toBeNull();
    });
  });

  describe('ContactWithUser', () => {
    it('deve aceitar estrutura válida com dados do usuário', () => {
      const contact: ContactWithUser = {
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: 'Meu Amigo',
        isBlocked: false,
        isFavorite: true,
        blockedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        contact: {
          id: 'user-456',
          username: 'contactuser',
          displayName: 'Contact User',
          avatarUrl: 'https://example.com/avatar.jpg',
          status: 'online',
          lastSeenAt: new Date(),
        },
      };

      expect(contact.contact.id).toBe('user-456');
      expect(contact.contact.username).toBe('contactuser');
      expect(contact.contact.status).toBe('online');
    });

    it('deve aceitar dados do usuário com valores null', () => {
      const contact: ContactWithUser = {
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: null,
        isBlocked: false,
        isFavorite: false,
        blockedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        contact: {
          id: 'user-456',
          username: 'contactuser',
          displayName: null,
          avatarUrl: null,
          status: 'offline',
          lastSeenAt: null,
        },
      };

      expect(contact.contact.displayName).toBeNull();
      expect(contact.contact.avatarUrl).toBeNull();
      expect(contact.contact.lastSeenAt).toBeNull();
    });
  });

  describe('ContactListFilters', () => {
    it('deve aceitar todos os filtros', () => {
      const filters: ContactListFilters = {
        isBlocked: true,
        isFavorite: false,
        search: 'termo de busca',
      };

      expect(filters.isBlocked).toBe(true);
      expect(filters.isFavorite).toBe(false);
      expect(filters.search).toBe('termo de busca');
    });

    it('deve aceitar objeto vazio', () => {
      const filters: ContactListFilters = {};
      expect(filters).toEqual({});
    });

    it('deve aceitar filtros parciais', () => {
      const filters: ContactListFilters = {
        isFavorite: true,
      };

      expect(filters.isFavorite).toBe(true);
      expect(filters.isBlocked).toBeUndefined();
    });
  });

  describe('ContactListOptions', () => {
    it('deve aceitar estrutura válida completa', () => {
      const options: ContactListOptions = {
        filters: { isFavorite: true },
        orderBy: 'nickname',
        order: 'ASC',
        limit: 50,
        offset: 0,
      };

      expect(options.orderBy).toBe('nickname');
      expect(options.limit).toBe(50);
    });

    it('deve aceitar todos os orderBy válidos', () => {
      const orderByValues: ContactListOptions['orderBy'][] = [
        'nickname',
        'createdAt',
        'lastInteraction',
      ];

      orderByValues.forEach((orderBy) => {
        const options: ContactListOptions = { orderBy };
        expect(options.orderBy).toBe(orderBy);
      });
    });

    it('deve aceitar order ASC e DESC', () => {
      const optionsAsc: ContactListOptions = { order: 'ASC' };
      const optionsDesc: ContactListOptions = { order: 'DESC' };

      expect(optionsAsc.order).toBe('ASC');
      expect(optionsDesc.order).toBe('DESC');
    });

    it('deve aceitar objeto vazio', () => {
      const options: ContactListOptions = {};
      expect(options).toEqual({});
    });
  });

  describe('PaginatedContacts', () => {
    it('deve aceitar estrutura válida', () => {
      const paginated: PaginatedContacts = {
        contacts: [
          {
            id: 'contact-1',
            userId: 'user-123',
            contactId: 'user-456',
            nickname: 'Amigo',
            isBlocked: false,
            isFavorite: true,
            blockedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            contact: {
              id: 'user-456',
              username: 'contactuser',
              displayName: 'Contact User',
              avatarUrl: null,
              status: 'online',
              lastSeenAt: new Date(),
            },
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      };

      expect(paginated.contacts).toHaveLength(1);
      expect(paginated.total).toBe(1);
      expect(paginated.hasMore).toBe(false);
    });

    it('deve aceitar lista vazia', () => {
      const paginated: PaginatedContacts = {
        contacts: [],
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      };

      expect(paginated.contacts).toHaveLength(0);
    });

    it('deve indicar hasMore quando há mais resultados', () => {
      const paginated: PaginatedContacts = {
        contacts: [],
        total: 100,
        limit: 50,
        offset: 0,
        hasMore: true,
      };

      expect(paginated.hasMore).toBe(true);
    });
  });

  describe('BlockedUser', () => {
    it('deve aceitar estrutura válida', () => {
      const blocked: BlockedUser = {
        id: 'block-123',
        userId: 'user-123',
        blockedUserId: 'user-456',
        blockedAt: new Date(),
        user: {
          id: 'user-456',
          username: 'blockeduser',
          displayName: 'Blocked User',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      };

      expect(blocked.id).toBe('block-123');
      expect(blocked.user.username).toBe('blockeduser');
    });

    it('deve aceitar dados do usuário com valores null', () => {
      const blocked: BlockedUser = {
        id: 'block-123',
        userId: 'user-123',
        blockedUserId: 'user-456',
        blockedAt: new Date(),
        user: {
          id: 'user-456',
          username: 'blockeduser',
          displayName: null,
          avatarUrl: null,
        },
      };

      expect(blocked.user.displayName).toBeNull();
      expect(blocked.user.avatarUrl).toBeNull();
    });
  });

  describe('ContactStats', () => {
    it('deve aceitar estrutura válida', () => {
      const stats: ContactStats = {
        total: 50,
        favorites: 10,
        blocked: 5,
      };

      expect(stats.total).toBe(50);
      expect(stats.favorites).toBe(10);
      expect(stats.blocked).toBe(5);
    });

    it('deve aceitar valores zero', () => {
      const stats: ContactStats = {
        total: 0,
        favorites: 0,
        blocked: 0,
      };

      expect(stats.total).toBe(0);
      expect(stats.favorites).toBe(0);
      expect(stats.blocked).toBe(0);
    });
  });
});
