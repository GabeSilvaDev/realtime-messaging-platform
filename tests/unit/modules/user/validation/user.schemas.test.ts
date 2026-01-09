import {
  createUserSchema,
  updateUserSchema,
  updateProfileSchema,
  updateAvatarSchema,
  updateStatusSchema,
  userIdParamSchema,
  searchUsersSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type UpdateProfileInput,
  type UpdateAvatarInput,
  type UpdateStatusInput,
  type UserIdParam,
  type SearchUsersQuery,
} from '@/modules/user/validation/user.schemas';

describe('user.schemas', () => {
  describe('createUserSchema', () => {
    describe('username', () => {
      it('deve validar username válido', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.username).toBe('testuser');
        }
      });

      it('deve converter username para lowercase', () => {
        const data = {
          username: 'TestUser',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.username).toBe('testuser');
        }
      });

      it('deve aceitar username com underscores e números', () => {
        const data = {
          username: 'test_user_123',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve rejeitar username muito curto', () => {
        const data = {
          username: 'ab',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Username deve ter no mínimo 3 caracteres');
        }
      });

      it('deve rejeitar username muito longo', () => {
        const data = {
          username: 'a'.repeat(51),
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Username deve ter no máximo 50 caracteres');
        }
      });

      it('deve rejeitar username com caracteres especiais', () => {
        const data = {
          username: 'test-user',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            'Username deve conter apenas letras, números e underscores'
          );
        }
      });

      it('deve rejeitar username com espaços', () => {
        const data = {
          username: 'test user',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
      });
    });

    describe('email', () => {
      it('deve validar email válido', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve converter email para lowercase', () => {
        const data = {
          username: 'testuser',
          email: 'Test@EXAMPLE.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.email).toBe('test@example.com');
        }
      });

      it('deve rejeitar email inválido', () => {
        const data = {
          username: 'testuser',
          email: 'invalid-email',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Email inválido');
        }
      });

      it('deve rejeitar email muito longo', () => {
        const data = {
          username: 'testuser',
          email: 'a'.repeat(250) + '@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Email deve ter no máximo 255 caracteres');
        }
      });
    });

    describe('password', () => {
      it('deve validar senha válida', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve rejeitar senha muito curta', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@12',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Senha deve ter no mínimo 8 caracteres');
        }
      });

      it('deve rejeitar senha muito longa', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@' + '1'.repeat(100),
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Senha deve ter no máximo 100 caracteres');
        }
      });

      it('deve rejeitar senha sem letra maiúscula', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            'Senha deve conter pelo menos uma letra maiúscula'
          );
        }
      });

      it('deve rejeitar senha sem letra minúscula', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'TEST@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            'Senha deve conter pelo menos uma letra minúscula'
          );
        }
      });

      it('deve rejeitar senha sem número', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@test',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe('Senha deve conter pelo menos um número');
        }
      });

      it('deve rejeitar senha sem caractere especial', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test12345',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            'Senha deve conter pelo menos um caractere especial'
          );
        }
      });
    });

    describe('displayName', () => {
      it('deve aceitar displayName opcional', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@1234',
          displayName: 'Test User',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.displayName).toBe('Test User');
        }
      });

      it('deve validar sem displayName', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@1234',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('deve rejeitar displayName muito curto', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@1234',
          displayName: 'A',
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            'Nome de exibição deve ter no mínimo 2 caracteres'
          );
        }
      });

      it('deve rejeitar displayName muito longo', () => {
        const data = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test@1234',
          displayName: 'A'.repeat(101),
        };
        const result = createUserSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toBe(
            'Nome de exibição deve ter no máximo 100 caracteres'
          );
        }
      });
    });
  });

  describe('updateUserSchema', () => {
    it('deve validar username opcional', () => {
      const data = { username: 'newusername' };
      const result = updateUserSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.username).toBe('newusername');
      }
    });

    it('deve converter username para lowercase', () => {
      const data = { username: 'NewUsername' };
      const result = updateUserSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.username).toBe('newusername');
      }
    });

    it('deve validar displayName opcional', () => {
      const data = { displayName: 'New Display Name' };
      const result = updateUserSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBe('New Display Name');
      }
    });

    it('deve aceitar displayName null', () => {
      const data = { displayName: null };
      const result = updateUserSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBeNull();
      }
    });

    it('deve validar objeto vazio', () => {
      const data = {};
      const result = updateUserSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar username inválido', () => {
      const data = { username: 'ab' };
      const result = updateUserSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('updateProfileSchema', () => {
    it('deve validar displayName válido', () => {
      const data = { displayName: 'New Display Name' };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar displayName null', () => {
      const data = { displayName: null };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve validar avatarUrl válida', () => {
      const data = { avatarUrl: 'https://example.com/avatar.jpg' };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar avatarUrl null', () => {
      const data = { avatarUrl: null };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar avatarUrl inválida', () => {
      const data = { avatarUrl: 'not-a-url' };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('URL do avatar inválida');
      }
    });

    it('deve rejeitar avatarUrl muito longa', () => {
      const data = { avatarUrl: 'https://example.com/' + 'a'.repeat(500) };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          'URL do avatar deve ter no máximo 500 caracteres'
        );
      }
    });

    it('deve validar bio válida', () => {
      const data = { bio: 'Esta é minha bio' };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar bio null', () => {
      const data = { bio: null };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar bio muito longa', () => {
      const data = { bio: 'a'.repeat(501) };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('Bio deve ter no máximo 500 caracteres');
      }
    });

    it('deve validar objeto vazio', () => {
      const data = {};
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve validar todos os campos juntos', () => {
      const data = {
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        bio: 'Uma bio',
      };
      const result = updateProfileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('updateAvatarSchema', () => {
    it('deve validar avatarUrl válida', () => {
      const data = { avatarUrl: 'https://example.com/avatar.jpg' };
      const result = updateAvatarSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar avatarUrl null', () => {
      const data = { avatarUrl: null };
      const result = updateAvatarSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar avatarUrl inválida', () => {
      const data = { avatarUrl: 'invalid-url' };
      const result = updateAvatarSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('URL do avatar inválida');
      }
    });

    it('deve rejeitar avatarUrl muito longa', () => {
      const data = { avatarUrl: 'https://example.com/' + 'a'.repeat(500) };
      const result = updateAvatarSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar objeto sem avatarUrl', () => {
      const data = {};
      const result = updateAvatarSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('updateStatusSchema', () => {
    const validStatuses = ['online', 'offline', 'away', 'busy'] as const;

    validStatuses.forEach((status) => {
      it(`deve validar status "${status}"`, () => {
        const data = { status };
        const result = updateStatusSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(status);
        }
      });
    });

    it('deve rejeitar status inválido', () => {
      const data = { status: 'invalid' };
      const result = updateStatusSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          'Status inválido. Use: online, offline, away ou busy'
        );
      }
    });

    it('deve rejeitar objeto sem status', () => {
      const data = {};
      const result = updateStatusSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('userIdParamSchema', () => {
    it('deve validar UUID válido', () => {
      const data = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      const result = userIdParamSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar UUID inválido', () => {
      const data = { userId: 'invalid-uuid' };
      const result = userIdParamSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('ID de usuário inválido');
      }
    });

    it('deve rejeitar objeto sem userId', () => {
      const data = {};
      const result = userIdParamSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('searchUsersSchema', () => {
    it('deve validar query válida', () => {
      const data = { query: 'test' };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve usar valores padrão', () => {
      const data = {};
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
        expect(result.data.orderBy).toBe('username');
        expect(result.data.order).toBe('ASC');
      }
    });

    it('deve validar status válidos', () => {
      const statuses = ['online', 'offline', 'away', 'busy'];
      statuses.forEach((status) => {
        const data = { status };
        const result = searchUsersSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    it('deve validar limite dentro do range', () => {
      const data = { limit: 50 };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('deve rejeitar limite muito grande', () => {
      const data = { limit: 101 };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar limite muito pequeno', () => {
      const data = { limit: 0 };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar offset negativo', () => {
      const data = { offset: -1 };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve validar orderBy válidos', () => {
      const orderByValues = ['username', 'displayName', 'createdAt', 'lastSeenAt'];
      orderByValues.forEach((orderBy) => {
        const data = { orderBy };
        const result = searchUsersSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    it('deve rejeitar orderBy inválido', () => {
      const data = { orderBy: 'invalid' };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve validar order ASC e DESC', () => {
      ['ASC', 'DESC'].forEach((order) => {
        const data = { order };
        const result = searchUsersSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    it('deve rejeitar order inválido', () => {
      const data = { order: 'invalid' };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar query muito longa', () => {
      const data = { query: 'a'.repeat(101) };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          'Termo de busca deve ter no máximo 100 caracteres'
        );
      }
    });

    it('deve converter limit string para número', () => {
      const data = { limit: '50' };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('deve converter offset string para número', () => {
      const data = { offset: '10' };
      const result = searchUsersSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(10);
      }
    });
  });

  describe('tipos exportados', () => {
    it('CreateUserInput deve corresponder ao schema', () => {
      const data: CreateUserInput = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test@1234',
        displayName: 'Test User',
      };
      expect(data).toBeDefined();
    });

    it('UpdateUserInput deve corresponder ao schema', () => {
      const data: UpdateUserInput = {
        username: 'newuser',
        displayName: 'New Name',
      };
      expect(data).toBeDefined();
    });

    it('UpdateProfileInput deve corresponder ao schema', () => {
      const data: UpdateProfileInput = {
        displayName: 'Name',
        avatarUrl: 'https://example.com/avatar.jpg',
        bio: 'Bio',
      };
      expect(data).toBeDefined();
    });

    it('UpdateAvatarInput deve corresponder ao schema', () => {
      const data: UpdateAvatarInput = {
        avatarUrl: 'https://example.com/avatar.jpg',
      };
      expect(data).toBeDefined();
    });

    it('UpdateStatusInput deve corresponder ao schema', () => {
      const data: UpdateStatusInput = {
        status: 'online',
      };
      expect(data).toBeDefined();
    });

    it('UserIdParam deve corresponder ao schema', () => {
      const data: UserIdParam = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
      };
      expect(data).toBeDefined();
    });

    it('SearchUsersQuery deve corresponder ao schema', () => {
      const data: SearchUsersQuery = {
        query: 'test',
        status: 'online',
        limit: 20,
        offset: 0,
        orderBy: 'username',
        order: 'ASC',
      };
      expect(data).toBeDefined();
    });
  });
});
