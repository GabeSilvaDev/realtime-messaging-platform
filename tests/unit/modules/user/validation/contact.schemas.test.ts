import {
  addContactSchema,
  updateContactSchema,
  contactIdParamSchema,
  blockUserSchema,
  listContactsSchema,
  searchUsersForContactSchema,
  type AddContactInput,
  type UpdateContactInput,
  type ContactIdParam,
  type BlockUserInput,
  type ListContactsQuery,
  type SearchUsersForContactQuery,
} from '@/modules/user/validation/contact.schemas';

describe('contact.schemas', () => {
  describe('addContactSchema', () => {
    describe('contactId', () => {
      it('deve validar contactId UUID válido', () => {
        const data = { contactId: '550e8400-e29b-41d4-a716-446655440000' };
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve rejeitar contactId inválido', () => {
        const data = { contactId: 'invalid-uuid' };
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('ID de contato inválido');
        }
      });

      it('deve rejeitar objeto sem contactId', () => {
        const data = {};
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    describe('nickname', () => {
      it('deve validar nickname opcional', () => {
        const data = {
          contactId: '550e8400-e29b-41d4-a716-446655440000',
          nickname: 'Meu Amigo',
        };
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.nickname).toBe('Meu Amigo');
        }
      });

      it('deve validar sem nickname', () => {
        const data = { contactId: '550e8400-e29b-41d4-a716-446655440000' };
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.nickname).toBeUndefined();
        }
      });

      it('deve rejeitar nickname vazio', () => {
        const data = {
          contactId: '550e8400-e29b-41d4-a716-446655440000',
          nickname: '',
        };
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Apelido deve ter no mínimo 1 caractere');
        }
      });

      it('deve rejeitar nickname muito longo', () => {
        const data = {
          contactId: '550e8400-e29b-41d4-a716-446655440000',
          nickname: 'a'.repeat(101),
        };
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Apelido deve ter no máximo 100 caracteres');
        }
      });

      it('deve aceitar nickname com 1 caractere', () => {
        const data = {
          contactId: '550e8400-e29b-41d4-a716-446655440000',
          nickname: 'A',
        };
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve aceitar nickname com 100 caracteres', () => {
        const data = {
          contactId: '550e8400-e29b-41d4-a716-446655440000',
          nickname: 'a'.repeat(100),
        };
        const result = addContactSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('updateContactSchema', () => {
    describe('nickname', () => {
      it('deve validar nickname válido', () => {
        const data = { nickname: 'Novo Apelido' };
        const result = updateContactSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve aceitar nickname null', () => {
        const data = { nickname: null };
        const result = updateContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.nickname).toBeNull();
        }
      });

      it('deve rejeitar nickname vazio', () => {
        const data = { nickname: '' };
        const result = updateContactSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Apelido deve ter no mínimo 1 caractere');
        }
      });

      it('deve rejeitar nickname muito longo', () => {
        const data = { nickname: 'a'.repeat(101) };
        const result = updateContactSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    describe('isFavorite', () => {
      it('deve validar isFavorite true', () => {
        const data = { isFavorite: true };
        const result = updateContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isFavorite).toBe(true);
        }
      });

      it('deve validar isFavorite false', () => {
        const data = { isFavorite: false };
        const result = updateContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isFavorite).toBe(false);
        }
      });

      it('deve rejeitar isFavorite não booleano', () => {
        const data = { isFavorite: 'true' };
        const result = updateContactSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    it('deve validar objeto vazio', () => {
      const data = {};
      const result = updateContactSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve validar com ambos campos', () => {
      const data = { nickname: 'Apelido', isFavorite: true };
      const result = updateContactSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nickname).toBe('Apelido');
        expect(result.data.isFavorite).toBe(true);
      }
    });
  });

  describe('contactIdParamSchema', () => {
    it('deve validar contactId UUID válido', () => {
      const data = { contactId: '550e8400-e29b-41d4-a716-446655440000' };
      const result = contactIdParamSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar contactId inválido', () => {
      const data = { contactId: 'invalid-uuid' };
      const result = contactIdParamSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('ID de contato inválido');
      }
    });

    it('deve rejeitar objeto sem contactId', () => {
      const data = {};
      const result = contactIdParamSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar contactId com formato incorreto', () => {
      const data = { contactId: '12345' };
      const result = contactIdParamSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('blockUserSchema', () => {
    it('deve validar userId UUID válido', () => {
      const data = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      const result = blockUserSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar userId inválido', () => {
      const data = { userId: 'invalid-uuid' };
      const result = blockUserSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('ID de usuário inválido');
      }
    });

    it('deve rejeitar objeto sem userId', () => {
      const data = {};
      const result = blockUserSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('listContactsSchema', () => {
    describe('valores padrão', () => {
      it('deve usar valores padrão', () => {
        const data = {};
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
          expect(result.data.offset).toBe(0);
          expect(result.data.orderBy).toBe('createdAt');
          expect(result.data.order).toBe('DESC');
        }
      });
    });

    describe('search', () => {
      it('deve validar search válido', () => {
        const data = { search: 'termo de busca' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve rejeitar search muito longo', () => {
        const data = { search: 'a'.repeat(101) };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            'Termo de busca deve ter no máximo 100 caracteres'
          );
        }
      });

      it('deve aceitar search vazio', () => {
        const data = { search: '' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    describe('isBlocked', () => {
      it('deve transformar string "true" para boolean true', () => {
        const data = { isBlocked: 'true' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isBlocked).toBe(true);
        }
      });

      it('deve transformar string "false" para boolean false', () => {
        const data = { isBlocked: 'false' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isBlocked).toBe(false);
        }
      });

      it('deve transformar qualquer outra string para false', () => {
        const data = { isBlocked: 'anything' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isBlocked).toBe(false);
        }
      });
    });

    describe('isFavorite', () => {
      it('deve transformar string "true" para boolean true', () => {
        const data = { isFavorite: 'true' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isFavorite).toBe(true);
        }
      });

      it('deve transformar string "false" para boolean false', () => {
        const data = { isFavorite: 'false' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isFavorite).toBe(false);
        }
      });
    });

    describe('limit', () => {
      it('deve validar limite válido', () => {
        const data = { limit: 25 };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(25);
        }
      });

      it('deve converter limite string para número', () => {
        const data = { limit: '75' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(75);
        }
      });

      it('deve rejeitar limite menor que 1', () => {
        const data = { limit: 0 };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(false);
      });

      it('deve rejeitar limite maior que 100', () => {
        const data = { limit: 101 };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    describe('offset', () => {
      it('deve validar offset válido', () => {
        const data = { offset: 10 };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.offset).toBe(10);
        }
      });

      it('deve converter offset string para número', () => {
        const data = { offset: '20' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.offset).toBe(20);
        }
      });

      it('deve rejeitar offset negativo', () => {
        const data = { offset: -1 };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    describe('orderBy', () => {
      it('deve validar orderBy "nickname"', () => {
        const data = { orderBy: 'nickname' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.orderBy).toBe('nickname');
        }
      });

      it('deve validar orderBy "createdAt"', () => {
        const data = { orderBy: 'createdAt' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve validar orderBy "lastInteraction"', () => {
        const data = { orderBy: 'lastInteraction' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve rejeitar orderBy inválido', () => {
        const data = { orderBy: 'invalid' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    describe('order', () => {
      it('deve validar order "ASC"', () => {
        const data = { order: 'ASC' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.order).toBe('ASC');
        }
      });

      it('deve validar order "DESC"', () => {
        const data = { order: 'DESC' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.order).toBe('DESC');
        }
      });

      it('deve rejeitar order inválido', () => {
        const data = { order: 'invalid' };
        const result = listContactsSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('searchUsersForContactSchema', () => {
    describe('query', () => {
      it('deve validar query válida', () => {
        const data = { query: 'termo de busca' };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.query).toBe('termo de busca');
        }
      });

      it('deve rejeitar query vazia', () => {
        const data = { query: '' };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Termo de busca é obrigatório');
        }
      });

      it('deve rejeitar query muito longa', () => {
        const data = { query: 'a'.repeat(101) };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            'Termo de busca deve ter no máximo 100 caracteres'
          );
        }
      });

      it('deve rejeitar objeto sem query', () => {
        const data = {};
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    describe('limit', () => {
      it('deve usar valor padrão de limite', () => {
        const data = { query: 'test' };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('deve validar limite dentro do range', () => {
        const data = { query: 'test', limit: 30 };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(30);
        }
      });

      it('deve converter limite string para número', () => {
        const data = { query: 'test', limit: '25' };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(25);
        }
      });

      it('deve rejeitar limite menor que 1', () => {
        const data = { query: 'test', limit: 0 };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(false);
      });

      it('deve rejeitar limite maior que 50', () => {
        const data = { query: 'test', limit: 51 };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    describe('excludeBlocked', () => {
      it('deve ter excludeBlocked true por padrão (qualquer string exceto "false")', () => {
        const data = { query: 'test', excludeBlocked: 'true' };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.excludeBlocked).toBe(true);
        }
      });

      it('deve transformar excludeBlocked "false" para boolean false', () => {
        const data = { query: 'test', excludeBlocked: 'false' };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.excludeBlocked).toBe(false);
        }
      });

      it('deve transformar string diferente de "false" para true', () => {
        const data = { query: 'test', excludeBlocked: 'yes' };
        const result = searchUsersForContactSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.excludeBlocked).toBe(true);
        }
      });
    });
  });

  describe('tipos exportados', () => {
    it('AddContactInput deve corresponder ao schema', () => {
      const data: AddContactInput = {
        contactId: '550e8400-e29b-41d4-a716-446655440000',
        nickname: 'Meu Amigo',
      };
      expect(data).toBeDefined();
    });

    it('AddContactInput deve funcionar sem nickname', () => {
      const data: AddContactInput = {
        contactId: '550e8400-e29b-41d4-a716-446655440000',
      };
      expect(data).toBeDefined();
    });

    it('UpdateContactInput deve corresponder ao schema', () => {
      const data: UpdateContactInput = {
        nickname: 'Novo Apelido',
        isFavorite: true,
      };
      expect(data).toBeDefined();
    });

    it('UpdateContactInput deve aceitar campos undefined', () => {
      const data: UpdateContactInput = {};
      expect(data).toBeDefined();
    });

    it('ContactIdParam deve corresponder ao schema', () => {
      const data: ContactIdParam = {
        contactId: '550e8400-e29b-41d4-a716-446655440000',
      };
      expect(data).toBeDefined();
    });

    it('BlockUserInput deve corresponder ao schema', () => {
      const data: BlockUserInput = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
      };
      expect(data).toBeDefined();
    });

    it('ListContactsQuery deve corresponder ao schema', () => {
      const data: ListContactsQuery = {
        search: 'termo',
        isBlocked: true,
        isFavorite: false,
        limit: 50,
        offset: 0,
        orderBy: 'createdAt',
        order: 'DESC',
      };
      expect(data).toBeDefined();
    });

    it('ListContactsQuery deve aceitar parcialmente preenchido', () => {
      const data: ListContactsQuery = {
        limit: 50,
        offset: 0,
        orderBy: 'createdAt',
        order: 'DESC',
      };
      expect(data).toBeDefined();
    });

    it('SearchUsersForContactQuery deve corresponder ao schema', () => {
      const data: SearchUsersForContactQuery = {
        query: 'termo de busca',
        limit: 20,
        excludeBlocked: true,
      };
      expect(data).toBeDefined();
    });
  });
});
