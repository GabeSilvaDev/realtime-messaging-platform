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

import {
  ProfileService,
  ProfileNotFoundException,
  InvalidAvatarUrlException,
} from '@/modules/user/services/ProfileService';
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
      await expect(
        profileService.updateAvatar('user-123', 'invalid-url')
      ).rejects.toThrow(InvalidAvatarUrlException);
    });

    it('deve lançar InvalidAvatarUrlException para URL com protocolo file', async () => {
      await expect(
        profileService.updateAvatar('user-123', 'file:///etc/passwd')
      ).rejects.toThrow(InvalidAvatarUrlException);
    });
  });

  describe('removeAvatar', () => {
    it('deve remover avatar do usuário', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, avatarUrl: null });

      const result = await profileService.removeAvatar('user-123');

      expect(result.avatarUrl).toBeNull();
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

  describe('updateStatus', () => {
    it('deve atualizar status do usuário', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.updateStatus.mockResolvedValue();

      await profileService.updateStatus('user-123', UserStatus.BUSY);

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.BUSY);
    });

    it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        profileService.updateStatus('nonexistent', UserStatus.ONLINE)
      ).rejects.toThrow(ProfileNotFoundException);
    });
  });

  describe('setOnline', () => {
    it('deve definir status como online', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();

      await profileService.setOnline('user-123');

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.ONLINE);
    });
  });

  describe('setOffline', () => {
    it('deve definir status como offline e atualizar lastSeen', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();
      mockUserRepository.updateLastSeen.mockResolvedValue();

      await profileService.setOffline('user-123');

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.OFFLINE);
      expect(mockUserRepository.updateLastSeen).toHaveBeenCalledWith('user-123');
    });
  });

  describe('setAway', () => {
    it('deve definir status como away', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();

      await profileService.setAway('user-123');

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.AWAY);
    });
  });

  describe('setBusy', () => {
    it('deve definir status como busy', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();

      await profileService.setBusy('user-123');

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.BUSY);
    });
  });
});
