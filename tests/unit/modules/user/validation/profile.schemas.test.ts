import {
  updateProfileSchema,
  updateDisplayNameSchema,
  updateBioSchema,
  updateStatusSchema,
  avatarFileSchema,
  uploadAvatarSchema,
  avatarProcessingOptionsSchema,
  avatarCropOptionsSchema,
  profileVisibilitySchema,
  notificationSettingsSchema,
  updateProfileSettingsSchema,
  updatePresenceSchema,
  bulkPresenceQuerySchema,
  profileIdParamSchema,
  type UpdateProfileInput,
  type UpdateDisplayNameInput,
  type UpdateBioInput,
  type UpdateStatusInput,
  type AvatarFileInput,
  type UploadAvatarInput,
  type AvatarProcessingOptionsInput,
  type AvatarCropOptionsInput,
  type ProfileVisibilityInput,
  type NotificationSettingsInput,
  type UpdateProfileSettingsInput,
  type UpdatePresenceInput,
  type BulkPresenceQuery,
  type ProfileIdParam,
} from '@/modules/user/validation/profile.schemas';
import { uploadConfig } from '@/shared/config/upload';

describe('profile.schemas', () => {
  describe('updateProfileSchema', () => {
    it('deve validar displayName válido', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'Novo Nome' });
      expect(result.success).toBe(true);
    });

    it('deve aceitar displayName null', () => {
      const result = updateProfileSchema.safeParse({ displayName: null });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar displayName muito curto', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'A' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar displayName muito longo', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'a'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('deve validar avatarUrl válida', () => {
      const result = updateProfileSchema.safeParse({
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      expect(result.success).toBe(true);
    });

    it('deve aceitar avatarUrl null', () => {
      const result = updateProfileSchema.safeParse({ avatarUrl: null });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar avatarUrl inválida', () => {
      const result = updateProfileSchema.safeParse({ avatarUrl: 'not-a-url' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('URL do avatar inválida');
      }
    });

    it('deve rejeitar avatarUrl muito longa', () => {
      const result = updateProfileSchema.safeParse({
        avatarUrl: `https://example.com/${'a'.repeat(500)}`,
      });
      expect(result.success).toBe(false);
    });

    it('deve validar bio válida', () => {
      const result = updateProfileSchema.safeParse({ bio: 'Minha bio' });
      expect(result.success).toBe(true);
    });

    it('deve aceitar bio null', () => {
      const result = updateProfileSchema.safeParse({ bio: null });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar bio muito longa', () => {
      const result = updateProfileSchema.safeParse({ bio: 'a'.repeat(501) });
      expect(result.success).toBe(false);
    });

    it('deve validar objeto vazio', () => {
      const result = updateProfileSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('updateDisplayNameSchema', () => {
    it('deve validar displayName válido', () => {
      const result = updateDisplayNameSchema.safeParse({ displayName: 'Nome Válido' });
      expect(result.success).toBe(true);
    });

    it('deve aceitar displayName null', () => {
      const result = updateDisplayNameSchema.safeParse({ displayName: null });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar displayName ausente', () => {
      const result = updateDisplayNameSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('deve rejeitar displayName muito curto', () => {
      const result = updateDisplayNameSchema.safeParse({ displayName: 'A' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar displayName muito longo', () => {
      const result = updateDisplayNameSchema.safeParse({ displayName: 'a'.repeat(101) });
      expect(result.success).toBe(false);
    });
  });

  describe('updateBioSchema', () => {
    it('deve validar bio válida', () => {
      const result = updateBioSchema.safeParse({ bio: 'Bio válida' });
      expect(result.success).toBe(true);
    });

    it('deve aceitar bio null', () => {
      const result = updateBioSchema.safeParse({ bio: null });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar bio ausente', () => {
      const result = updateBioSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('deve rejeitar bio muito longa', () => {
      const result = updateBioSchema.safeParse({ bio: 'a'.repeat(501) });
      expect(result.success).toBe(false);
    });
  });

  describe('updateStatusSchema', () => {
    it('deve validar status válido', () => {
      const result = updateStatusSchema.safeParse({ status: 'online' });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar status inválido', () => {
      const result = updateStatusSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          'Status inválido. Use: online, offline, away ou busy'
        );
      }
    });
  });

  describe('avatarFileSchema', () => {
    const baseFile = {
      fieldname: 'avatar',
      originalname: 'avatar.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-image'),
      size: 1024,
    };

    it('deve validar arquivo de avatar válido', () => {
      const result = avatarFileSchema.safeParse(baseFile);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar originalname vazio', () => {
      const result = avatarFileSchema.safeParse({ ...baseFile, originalname: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('Nome do arquivo é obrigatório');
      }
    });

    it('deve rejeitar mimetype não suportado', () => {
      const result = avatarFileSchema.safeParse({ ...baseFile, mimetype: 'application/pdf' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe(
          'Tipo de imagem não suportado. Use: JPEG, PNG, WebP ou GIF'
        );
      }
    });

    it('deve rejeitar arquivo maior que o limite configurado', () => {
      const result = avatarFileSchema.safeParse({
        ...baseFile,
        size: uploadConfig.limits.maxAvatarSize + 1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const maxAvatarSizeMB = Math.round(uploadConfig.limits.maxAvatarSize / (1024 * 1024));
        expect(result.error.issues[0]!.message).toBe(
          `Tamanho máximo do avatar: ${String(maxAvatarSizeMB)}MB`
        );
      }
    });

    it('deve rejeitar buffer que não é Buffer', () => {
      const result = avatarFileSchema.safeParse({ ...baseFile, buffer: 'not-a-buffer' });
      expect(result.success).toBe(false);
    });
  });

  describe('uploadAvatarSchema', () => {
    const baseFile = {
      fieldname: 'avatar',
      originalname: 'avatar.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-image'),
      size: 1024,
    };

    it('deve validar upload sem opções', () => {
      const result = uploadAvatarSchema.safeParse({ file: baseFile });
      expect(result.success).toBe(true);
    });

    it('deve validar upload com opções', () => {
      const result = uploadAvatarSchema.safeParse({
        file: baseFile,
        options: { quality: 80, format: 'webp', generateAllSizes: false },
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar quality fora do range nas opções', () => {
      const result = uploadAvatarSchema.safeParse({
        file: baseFile,
        options: { quality: 101 },
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar sem file', () => {
      const result = uploadAvatarSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('avatarProcessingOptionsSchema', () => {
    it('deve usar valores padrão quando nada é informado', () => {
      const result = avatarProcessingOptionsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quality).toBe(uploadConfig.avatar.quality);
        expect(result.data.format).toBe(uploadConfig.avatar.format);
        expect(result.data.generateAllSizes).toBe(true);
      }
    });

    it('deve validar valores customizados', () => {
      const result = avatarProcessingOptionsSchema.safeParse({
        quality: 50,
        format: 'jpeg',
        generateAllSizes: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quality).toBe(50);
        expect(result.data.format).toBe('jpeg');
        expect(result.data.generateAllSizes).toBe(false);
      }
    });

    it('deve rejeitar quality abaixo do mínimo', () => {
      const result = avatarProcessingOptionsSchema.safeParse({ quality: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('Qualidade deve ser no mínimo 1');
      }
    });

    it('deve rejeitar quality acima do máximo', () => {
      const result = avatarProcessingOptionsSchema.safeParse({ quality: 101 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('Qualidade deve ser no máximo 100');
      }
    });

    it('deve rejeitar formato inválido', () => {
      const result = avatarProcessingOptionsSchema.safeParse({ format: 'bmp' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('Formato inválido. Use: webp, jpeg ou png');
      }
    });
  });

  describe('avatarCropOptionsSchema', () => {
    it('deve validar objeto vazio (tudo opcional)', () => {
      const result = avatarCropOptionsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('deve validar todos os campos de crop', () => {
      const result = avatarCropOptionsSchema.safeParse({
        cropX: 0,
        cropY: 0,
        cropWidth: 100,
        cropHeight: 100,
        rotate: 90,
        quality: 80,
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar cropWidth zerado', () => {
      const result = avatarCropOptionsSchema.safeParse({ cropWidth: 0 });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar rotate fora do range', () => {
      const result = avatarCropOptionsSchema.safeParse({ rotate: 400 });
      expect(result.success).toBe(false);
    });
  });

  describe('profileVisibilitySchema', () => {
    it('deve validar objeto vazio', () => {
      const result = profileVisibilitySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('deve validar todos os campos', () => {
      const result = profileVisibilitySchema.safeParse({
        showEmail: true,
        showLastSeen: false,
        showStatus: true,
        showBio: false,
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar tipo inválido', () => {
      const result = profileVisibilitySchema.safeParse({ showEmail: 'yes' });
      expect(result.success).toBe(false);
    });
  });

  describe('notificationSettingsSchema', () => {
    it('deve validar objeto vazio', () => {
      const result = notificationSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('deve validar todos os campos', () => {
      const result = notificationSettingsSchema.safeParse({
        email: true,
        push: false,
        sound: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('updateProfileSettingsSchema', () => {
    it('deve validar objeto vazio', () => {
      const result = updateProfileSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('deve validar configurações completas', () => {
      const result = updateProfileSettingsSchema.safeParse({
        visibility: { showEmail: true },
        notifications: { email: true },
        theme: 'dark',
        language: 'pt-BR',
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar theme inválido', () => {
      const result = updateProfileSettingsSchema.safeParse({ theme: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar language inválido', () => {
      const result = updateProfileSettingsSchema.safeParse({ language: 'x' });
      expect(result.success).toBe(false);
    });
  });

  describe('updatePresenceSchema', () => {
    it('deve validar status válido', () => {
      const result = updatePresenceSchema.safeParse({ status: 'away' });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar status inválido', () => {
      const result = updatePresenceSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('Status inválido');
      }
    });
  });

  describe('bulkPresenceQuerySchema', () => {
    it('deve transformar string de userIds separados por vírgula em array', () => {
      const id1 = '550e8400-e29b-41d4-a716-446655440000';
      const id2 = '660e8400-e29b-41d4-a716-446655440001';
      const result = bulkPresenceQuerySchema.safeParse({ userIds: `${id1}, ${id2}` });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userIds).toEqual([id1, id2]);
      }
    });

    it('deve rejeitar userIds vazio', () => {
      const result = bulkPresenceQuerySchema.safeParse({ userIds: '' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar id inválido dentro da lista', () => {
      const result = bulkPresenceQuerySchema.safeParse({ userIds: 'not-a-uuid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('ID de usuário inválido');
      }
    });

    it('deve rejeitar mais de 100 ids', () => {
      const ids = Array.from(
        { length: 101 },
        (_, i) => `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
      ).join(',');
      const result = bulkPresenceQuerySchema.safeParse({ userIds: ids });
      expect(result.success).toBe(false);
    });
  });

  describe('profileIdParamSchema', () => {
    it('deve validar UUID válido', () => {
      const result = profileIdParamSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar UUID inválido', () => {
      const result = profileIdParamSchema.safeParse({ userId: 'invalid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toBe('ID de usuário inválido');
      }
    });
  });

  describe('tipos exportados', () => {
    it('UpdateProfileInput deve corresponder ao schema', () => {
      const data: UpdateProfileInput = { displayName: 'Nome', avatarUrl: null, bio: null };
      expect(data).toBeDefined();
    });

    it('UpdateDisplayNameInput deve corresponder ao schema', () => {
      const data: UpdateDisplayNameInput = { displayName: 'Nome' };
      expect(data).toBeDefined();
    });

    it('UpdateBioInput deve corresponder ao schema', () => {
      const data: UpdateBioInput = { bio: 'Bio' };
      expect(data).toBeDefined();
    });

    it('UpdateStatusInput deve corresponder ao schema', () => {
      const data: UpdateStatusInput = { status: 'online' };
      expect(data).toBeDefined();
    });

    it('AvatarFileInput deve corresponder ao schema', () => {
      const data: AvatarFileInput = {
        fieldname: 'avatar',
        originalname: 'avatar.png',
        encoding: '7bit',
        mimetype: 'image/png',
        buffer: Buffer.from('x'),
        size: 10,
      };
      expect(data).toBeDefined();
    });

    it('UploadAvatarInput deve corresponder ao schema', () => {
      const data: UploadAvatarInput = {
        file: {
          fieldname: 'avatar',
          originalname: 'avatar.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('x'),
          size: 10,
        },
      };
      expect(data).toBeDefined();
    });

    it('AvatarProcessingOptionsInput deve corresponder ao schema', () => {
      const data: AvatarProcessingOptionsInput = {
        quality: 80,
        format: 'webp',
        generateAllSizes: true,
      };
      expect(data).toBeDefined();
    });

    it('AvatarCropOptionsInput deve corresponder ao schema', () => {
      const data: AvatarCropOptionsInput = { cropX: 0, cropY: 0 };
      expect(data).toBeDefined();
    });

    it('ProfileVisibilityInput deve corresponder ao schema', () => {
      const data: ProfileVisibilityInput = { showEmail: true };
      expect(data).toBeDefined();
    });

    it('NotificationSettingsInput deve corresponder ao schema', () => {
      const data: NotificationSettingsInput = { email: true };
      expect(data).toBeDefined();
    });

    it('UpdateProfileSettingsInput deve corresponder ao schema', () => {
      const data: UpdateProfileSettingsInput = { theme: 'dark' };
      expect(data).toBeDefined();
    });

    it('UpdatePresenceInput deve corresponder ao schema', () => {
      const data: UpdatePresenceInput = { status: 'online' };
      expect(data).toBeDefined();
    });

    it('BulkPresenceQuery deve corresponder ao schema', () => {
      const data: BulkPresenceQuery = { userIds: ['550e8400-e29b-41d4-a716-446655440000'] };
      expect(data).toBeDefined();
    });

    it('ProfileIdParam deve corresponder ao schema', () => {
      const data: ProfileIdParam = { userId: '550e8400-e29b-41d4-a716-446655440000' };
      expect(data).toBeDefined();
    });
  });
});
