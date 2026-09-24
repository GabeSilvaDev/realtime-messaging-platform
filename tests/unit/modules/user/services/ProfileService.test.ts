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
jest.mock('@/modules/presence/services/PresenceService', () => ({ presenceService: {} }));

import {
  ProfileService,
  ProfileNotFoundException,
  InvalidAvatarUrlException,
  BioTooLongException,
  DisplayNameTooLongException,
  OfflineStatusNotAllowedException,
} from '@/modules/user/services/ProfileService';
import type { IAvatarService } from '@/modules/user/interfaces';
import type { AvatarFile, AvatarUploadResult } from '@/modules/user/types';
import { userRepository } from '@/modules/user/repositories';
import { UserStatus } from '@/shared/types';
import { HttpStatus, ErrorCode } from '@/shared/errors';

const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;

describe('ProfileService', () => {
  let profileService: ProfileService;

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
    profileService = new ProfileService(mockUserRepository);
  });

  describe('ProfileNotFoundException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new ProfileNotFoundException();
      expect(exception.message).toBe('Perfil não encontrado');
      expect(exception.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(exception.code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('deve criar exceção com mensagem personalizada', () => {
      const exception = new ProfileNotFoundException('Perfil específico não encontrado');
      expect(exception.message).toBe('Perfil específico não encontrado');
    });
  });

  describe('InvalidAvatarUrlException', () => {
    it('deve criar exceção com mensagem padrão', () => {
      const exception = new InvalidAvatarUrlException();
      expect(exception.message).toBe('URL do avatar inválida');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('deve criar exceção com mensagem personalizada', () => {
      const exception = new InvalidAvatarUrlException('URL inválida para avatar');
      expect(exception.message).toBe('URL inválida para avatar');
    });
  });

  describe('getProfile', () => {
    it('deve retornar perfil do usuário quando encontrado', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await profileService.getProfile('user-123');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({
        id: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        displayName: mockUser.displayName,
        avatarUrl: mockUser.avatarUrl,
        bio: null,
        status: mockUser.status,
        lastSeenAt: mockUser.lastSeenAt,
        createdAt: mockUser.createdAt,
      });
    });

    it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(profileService.getProfile('nonexistent')).rejects.toThrow(
        ProfileNotFoundException
      );
    });
  });

  describe('updateProfile', () => {
    it('deve atualizar displayName com sucesso', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        displayName: 'Novo Nome',
      });

      const result = await profileService.updateProfile('user-123', {
        displayName: 'Novo Nome',
      });

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', {
        displayName: 'Novo Nome',
      });
      expect(result.displayName).toBe('Novo Nome');
    });

    it('deve atualizar avatarUrl com URL válida', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        avatarUrl: 'https://example.com/new-avatar.jpg',
      });

      const result = await profileService.updateProfile('user-123', {
        avatarUrl: 'https://example.com/new-avatar.jpg',
      });

      expect(result.avatarUrl).toBe('https://example.com/new-avatar.jpg');
    });

    it('deve permitir URL http para avatar', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        avatarUrl: 'http://example.com/avatar.jpg',
      });

      const result = await profileService.updateProfile('user-123', {
        avatarUrl: 'http://example.com/avatar.jpg',
      });

      expect(result.avatarUrl).toBe('http://example.com/avatar.jpg');
    });

    it('deve permitir avatarUrl null', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        avatarUrl: null,
      });

      const result = await profileService.updateProfile('user-123', {
        avatarUrl: null,
      });

      expect(result.avatarUrl).toBeNull();
    });

    it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        profileService.updateProfile('nonexistent', { displayName: 'Test' })
      ).rejects.toThrow(ProfileNotFoundException);
    });

    it('deve lançar InvalidAvatarUrlException para URL com protocolo inválido', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await expect(
        profileService.updateProfile('user-123', { avatarUrl: 'ftp://example.com/avatar.jpg' })
      ).rejects.toThrow(InvalidAvatarUrlException);
    });

    it('deve lançar InvalidAvatarUrlException para URL malformada', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await expect(
        profileService.updateProfile('user-123', { avatarUrl: 'not-a-valid-url' })
      ).rejects.toThrow(InvalidAvatarUrlException);
    });

    it('deve lançar ProfileNotFoundException quando update retorna null', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(null);

      await expect(
        profileService.updateProfile('user-123', { displayName: 'Test' })
      ).rejects.toThrow(ProfileNotFoundException);
    });

    it('deve atualizar múltiplos campos simultaneamente', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        displayName: 'Novo Nome',
        avatarUrl: 'https://example.com/new-avatar.jpg',
      });

      const result = await profileService.updateProfile('user-123', {
        displayName: 'Novo Nome',
        avatarUrl: 'https://example.com/new-avatar.jpg',
      });

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', {
        displayName: 'Novo Nome',
        avatarUrl: 'https://example.com/new-avatar.jpg',
      });
      expect(result.displayName).toBe('Novo Nome');
      expect(result.avatarUrl).toBe('https://example.com/new-avatar.jpg');
    });

    it('não deve incluir campos undefined no updateData', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(mockUser);

      await profileService.updateProfile('user-123', {});

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', {});
    });
  });

  describe('updateAvatar', () => {
    it('deve atualizar avatar com URL válida', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        avatarUrl: 'https://example.com/new-avatar.jpg',
      });

      const result = await profileService.updateAvatar(
        'user-123',
        'https://example.com/new-avatar.jpg'
      );

      expect(result.avatarUrl).toBe('https://example.com/new-avatar.jpg');
    });

    it('deve permitir remover avatar com null', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, avatarUrl: null });

      const result = await profileService.updateAvatar('user-123', null);

      expect(result.avatarUrl).toBeNull();
    });

    it('deve lançar InvalidAvatarUrlException para URL inválida', async () => {
      await expect(profileService.updateAvatar('user-123', 'invalid-url')).rejects.toThrow(
        InvalidAvatarUrlException
      );
    });

    it('deve lançar InvalidAvatarUrlException para URL com protocolo file', async () => {
      await expect(profileService.updateAvatar('user-123', 'file:///etc/passwd')).rejects.toThrow(
        InvalidAvatarUrlException
      );
    });
  });

  describe('removeAvatar', () => {
    it('deve remover avatar do usuário', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, avatarUrl: null });

      const result = await profileService.removeAvatar('user-123');

      expect(result.deleted).toBeDefined();
    });
  });

  describe('updateDisplayName', () => {
    it('deve atualizar displayName', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        displayName: 'Novo Nome',
      });

      const result = await profileService.updateDisplayName('user-123', 'Novo Nome');

      expect(result.displayName).toBe('Novo Nome');
    });

    it('deve permitir remover displayName com null', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, displayName: null });

      const result = await profileService.updateDisplayName('user-123', null);

      expect(result.displayName).toBeNull();
    });
  });

  describe('status legado (delegado à presença)', () => {
    let presence: { setManualStatus: jest.Mock };
    let service: ProfileService;

    beforeEach(() => {
      presence = {
        setManualStatus: jest.fn().mockResolvedValue({ state: 'online', changed: false }),
      };
      service = new ProfileService(mockUserRepository, undefined, undefined, presence);
    });

    it.each([
      [UserStatus.ONLINE, 'available'],
      [UserStatus.AWAY, 'away'],
      [UserStatus.BUSY, 'busy'],
    ])(
      'updateStatus(%s) grava o status manual %s e não toca users.status',
      async (status, manual) => {
        mockUserRepository.findById.mockResolvedValue(mockUser);

        await service.updateStatus('user-123', status);

        expect(presence.setManualStatus).toHaveBeenCalledWith('user-123', manual);
        expect(mockUserRepository.updateStatus).not.toHaveBeenCalled();
      }
    );

    it('updateStatus(offline) → 400 sem consultar nada', async () => {
      await expect(service.updateStatus('user-123', UserStatus.OFFLINE)).rejects.toThrow(
        OfflineStatusNotAllowedException
      );
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(presence.setManualStatus).not.toHaveBeenCalled();
    });

    it('updateStatus de perfil inexistente → ProfileNotFoundException', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(service.updateStatus('nonexistent', UserStatus.ONLINE)).rejects.toThrow(
        ProfileNotFoundException
      );
      expect(presence.setManualStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['setOnline', 'available'],
      ['setAway', 'away'],
      ['setBusy', 'busy'],
    ] as const)('%s grava o status manual %s', async (method, manual) => {
      await service[method]('user-123');

      expect(presence.setManualStatus).toHaveBeenCalledWith('user-123', manual);
      expect(mockUserRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('setOffline → 400 (offline vem da desconexão)', async () => {
      await expect(service.setOffline('user-123')).rejects.toThrow(
        OfflineStatusNotAllowedException
      );
      expect(presence.setManualStatus).not.toHaveBeenCalled();
      expect(mockUserRepository.updateLastSeen).not.toHaveBeenCalled();
    });
  });

  describe('com avatar service mockado', () => {
    let mockAvatarService: jest.Mocked<IAvatarService>;
    let service: ProfileService;

    const avatarFile: AvatarFile = {
      fieldname: 'avatar',
      originalname: 'avatar.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-image'),
      size: 1024,
    };

    const uploadResult: AvatarUploadResult = {
      urls: {
        original: '/uploads/avatars/original/user-123/a.webp',
        large: '/uploads/avatars/large/user-123/a.webp',
        medium: '/uploads/avatars/medium/user-123/a.webp',
        small: '/uploads/avatars/small/user-123/a.webp',
        thumbnail: '/uploads/avatars/thumbnail/user-123/a.webp',
      },
      metadata: {
        originalName: 'avatar.png',
        mimeType: 'image/png',
        originalSize: 1024,
        processedSizes: [],
        uploadedAt: new Date('2026-01-01'),
      },
    };

    beforeEach(() => {
      mockAvatarService = {
        upload: jest.fn(),
        delete: jest.fn(),
        deleteOldAvatars: jest.fn(),
        getAvatarUrls: jest.fn(),
        validateAvatarFile: jest.fn(),
        exists: jest.fn(),
      };
      service = new ProfileService(mockUserRepository, mockAvatarService);
    });

    describe('uploadAvatar', () => {
      it('deve fazer upload e atualizar avatarUrl com a URL medium', async () => {
        mockUserRepository.findById.mockResolvedValue(mockUser);
        mockAvatarService.upload.mockResolvedValue(uploadResult);
        mockUserRepository.update.mockResolvedValue({
          ...mockUser,
          avatarUrl: uploadResult.urls.medium,
        });

        const result = await service.uploadAvatar('user-123', avatarFile, { format: 'png' });

        expect(mockAvatarService.upload).toHaveBeenCalledWith('user-123', avatarFile, {
          format: 'png',
        });
        expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', {
          avatarUrl: uploadResult.urls.medium,
        });
        expect(result).toBe(uploadResult);
      });

      it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
        mockUserRepository.findById.mockResolvedValue(null);

        await expect(service.uploadAvatar('nonexistent', avatarFile)).rejects.toThrow(
          ProfileNotFoundException
        );
        expect(mockAvatarService.upload).not.toHaveBeenCalled();
      });

      it('deve propagar erro do avatar service sem atualizar o usuário', async () => {
        mockUserRepository.findById.mockResolvedValue(mockUser);
        mockAvatarService.upload.mockRejectedValue(new Error('upload failed'));

        await expect(service.uploadAvatar('user-123', avatarFile)).rejects.toThrow('upload failed');
        expect(mockUserRepository.update).not.toHaveBeenCalled();
      });
    });

    describe('removeAvatar', () => {
      it('deve deletar arquivos e limpar avatarUrl', async () => {
        const deleteResult = { deleted: true, deletedFiles: ['avatars/medium/user-123/a.webp'] };
        mockUserRepository.findById.mockResolvedValue(mockUser);
        mockAvatarService.delete.mockResolvedValue(deleteResult);
        mockUserRepository.update.mockResolvedValue({ ...mockUser, avatarUrl: null });

        const result = await service.removeAvatar('user-123');

        expect(mockAvatarService.delete).toHaveBeenCalledWith('user-123');
        expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', { avatarUrl: null });
        expect(result).toBe(deleteResult);
      });

      it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
        mockUserRepository.findById.mockResolvedValue(null);

        await expect(service.removeAvatar('nonexistent')).rejects.toThrow(ProfileNotFoundException);
        expect(mockAvatarService.delete).not.toHaveBeenCalled();
      });
    });
  });

  describe('getPublicProfile', () => {
    it('deve retornar perfil público com bio null quando usuário não possui bio', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await profileService.getPublicProfile('user-123');

      expect(result).toEqual({
        id: mockUser.id,
        username: mockUser.username,
        displayName: mockUser.displayName,
        avatarUrl: mockUser.avatarUrl,
        bio: null,
      });
      expect(result).not.toHaveProperty('email');
      // O estado e o visto por último de outro usuário saem só pela presença.
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('lastSeenAt');
    });

    it('deve retornar bio quando presente', async () => {
      mockUserRepository.findById.mockResolvedValue({ ...mockUser, bio: 'Minha bio' } as never);

      const result = await profileService.getPublicProfile('user-123');

      expect(result.bio).toBe('Minha bio');
    });

    it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(profileService.getPublicProfile('nonexistent')).rejects.toThrow(
        ProfileNotFoundException
      );
    });
  });

  describe('getProfile (mapeamento de campos opcionais)', () => {
    it('deve normalizar campos ausentes para null', async () => {
      mockUserRepository.findById.mockResolvedValue({
        ...mockUser,
        displayName: undefined,
        avatarUrl: undefined,
        lastSeenAt: undefined,
      } as never);

      const result = await profileService.getProfile('user-123');

      expect(result.displayName).toBeNull();
      expect(result.avatarUrl).toBeNull();
      expect(result.lastSeenAt).toBeNull();
      expect(result.bio).toBeNull();
    });

    it('deve mapear bio quando presente', async () => {
      mockUserRepository.findById.mockResolvedValue({ ...mockUser, bio: 'Minha bio' } as never);

      const result = await profileService.getProfile('user-123');

      expect(result.bio).toBe('Minha bio');
    });
  });

  describe('updateProfile (validações de tamanho)', () => {
    it('deve lançar DisplayNameTooLongException quando displayName excede 100 caracteres', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await expect(
        profileService.updateProfile('user-123', { displayName: 'a'.repeat(101) })
      ).rejects.toThrow(DisplayNameTooLongException);
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('deve aceitar displayName com exatamente 100 caracteres', async () => {
      const displayName = 'a'.repeat(100);
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, displayName });

      const result = await profileService.updateProfile('user-123', { displayName });

      expect(result.displayName).toBe(displayName);
    });

    it('deve lançar BioTooLongException quando bio excede 500 caracteres', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await expect(
        profileService.updateProfile('user-123', { bio: 'a'.repeat(501) })
      ).rejects.toThrow(BioTooLongException);
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('deve incluir bio no updateData quando informada', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, bio: 'Nova bio' } as never);

      const result = await profileService.updateProfile('user-123', { bio: 'Nova bio' });

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', { bio: 'Nova bio' });
      expect(result.bio).toBe('Nova bio');
    });
  });

  describe('updateBio', () => {
    it('deve atualizar bio', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, bio: 'Nova bio' } as never);

      const result = await profileService.updateBio('user-123', 'Nova bio');

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', { bio: 'Nova bio' });
      expect(result.bio).toBe('Nova bio');
    });

    it('deve permitir remover bio com null', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, bio: null } as never);

      const result = await profileService.updateBio('user-123', null);

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', { bio: null });
      expect(result.bio).toBeNull();
    });
  });

  describe('getProfileStats', () => {
    it('deve retornar estatísticas com lastActive igual a lastSeenAt', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await profileService.getProfileStats('user-123');

      expect(result).toEqual({
        contactsCount: 0,
        blockedCount: 0,
        favoritesCount: 0,
        memberSince: mockUser.createdAt,
        lastActive: mockUser.lastSeenAt,
      });
    });

    it('deve usar createdAt como lastActive quando lastSeenAt é null', async () => {
      const createdAt = new Date('2025-06-01');
      mockUserRepository.findById.mockResolvedValue({ ...mockUser, lastSeenAt: null, createdAt });

      const result = await profileService.getProfileStats('user-123');

      expect(result.lastActive).toBe(createdAt);
    });

    it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(profileService.getProfileStats('nonexistent')).rejects.toThrow(
        ProfileNotFoundException
      );
    });
  });

  describe('getProfileSettings', () => {
    it('deve retornar configurações padrão', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await profileService.getProfileSettings('user-123');

      expect(result).toEqual({
        visibility: {
          showEmail: false,
          showLastSeen: true,
          showStatus: true,
          showBio: true,
        },
        notifications: {
          email: true,
          push: true,
          sound: true,
        },
        theme: 'system',
        language: 'pt-BR',
      });
    });

    it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(profileService.getProfileSettings('nonexistent')).rejects.toThrow(
        ProfileNotFoundException
      );
    });
  });

  describe('updateProfileSettings', () => {
    it('deve retornar as configurações atuais após atualização', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await profileService.updateProfileSettings('user-123', { theme: 'dark' });

      expect(mockUserRepository.findById).toHaveBeenCalledTimes(2);
      expect(result.theme).toBe('system');
    });

    it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        profileService.updateProfileSettings('nonexistent', { theme: 'dark' })
      ).rejects.toThrow(ProfileNotFoundException);
    });
  });
});
