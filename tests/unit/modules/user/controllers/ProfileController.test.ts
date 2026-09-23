jest.mock('@/shared/database', () => ({
  sequelize: { models: {} },
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

jest.mock('@/modules/user/services/ProfileService', () => ({
  ProfileService: jest.fn(),
}));

import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { HttpStatus } from '@/shared/errors';
import { UserStatus } from '@/shared/types';
import { FileSizeLimitError, FileUploadError } from '@/shared/middlewares';
import { ProfileController, profileController } from '@/modules/user/controllers/ProfileController';
import { ProfileService } from '@/modules/user/services/ProfileService';
import type { IProfileService } from '@/modules/user/interfaces';
import type { MulterFile } from '@/modules/user/types/controller.types';

describe('ProfileController', () => {
  let controller: ProfileController;
  let mockService: jest.Mocked<IProfileService>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: jest.MockedFunction<NextFunction>;

  const userId = 'user-123';

  const profile = {
    id: userId,
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    bio: null,
    status: UserStatus.ONLINE,
    lastSeenAt: null,
    createdAt: new Date('2026-01-01'),
  };

  const settings = {
    visibility: { showEmail: false, showLastSeen: true, showStatus: true, showBio: true },
    notifications: { email: true, push: true, sound: true },
    theme: 'system' as const,
    language: 'pt-BR',
  };

  const file: MulterFile = {
    fieldname: 'avatar',
    originalname: 'avatar.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('fake-image'),
  };

  const uploadResult = {
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
    mockService = {
      getProfile: jest.fn(),
      getPublicProfile: jest.fn(),
      updateProfile: jest.fn(),
      updateDisplayName: jest.fn(),
      updateBio: jest.fn(),
      uploadAvatar: jest.fn(),
      updateAvatar: jest.fn(),
      removeAvatar: jest.fn(),
      updateStatus: jest.fn(),
      setOnline: jest.fn(),
      setOffline: jest.fn(),
      setAway: jest.fn(),
      setBusy: jest.fn(),
      getProfileStats: jest.fn(),
      getProfileSettings: jest.fn(),
      updateProfileSettings: jest.fn(),
    };
    controller = new ProfileController(mockService);
    mockReq = {
      body: {},
      params: {},
      user: { id: userId, email: 'test@example.com', username: 'testuser' },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  const req = (): Request => mockReq as Request;
  const res = (): Response => mockRes as Response;

  describe('constructor', () => {
    it('deve instanciar ProfileService padrão quando nenhum service é injetado', () => {
      const instance = new ProfileController();

      expect(instance).toBeInstanceOf(ProfileController);
      expect(ProfileService).toHaveBeenCalledTimes(1);
    });

    it('deve exportar instância singleton profileController', () => {
      expect(profileController).toBeInstanceOf(ProfileController);
    });
  });

  describe('getUserId (via getProfile)', () => {
    it('deve lançar erro quando req.user não existe', async () => {
      delete mockReq.user;

      await expect(controller.getProfile(req(), res())).rejects.toThrow('Usuário não autenticado');
      expect(mockService.getProfile).not.toHaveBeenCalled();
    });

    it('deve lançar erro quando req.user.id é vazio', async () => {
      mockReq.user = { id: '', email: 'test@example.com', username: 'testuser' };

      await expect(controller.getProfile(req(), res())).rejects.toThrow('Usuário não autenticado');
    });
  });

  describe('getProfile', () => {
    it('deve retornar o perfil do usuário autenticado', async () => {
      mockService.getProfile.mockResolvedValue(profile);

      await controller.getProfile(req(), res());

      expect(mockService.getProfile).toHaveBeenCalledWith(userId);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: profile });
    });
  });

  describe('getPublicProfile', () => {
    it('deve retornar 400 quando userId não é informado', async () => {
      mockReq.params = {};

      await controller.getPublicProfile(req(), res());

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'ID do usuário é obrigatório',
      });
      expect(mockService.getPublicProfile).not.toHaveBeenCalled();
    });

    it('deve retornar 400 quando userId é string vazia', async () => {
      mockReq.params = { userId: '' };

      await controller.getPublicProfile(req(), res());

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockService.getPublicProfile).not.toHaveBeenCalled();
    });

    it('deve retornar o perfil público', async () => {
      const publicProfile = {
        id: 'other-user',
        username: 'other',
        displayName: null,
        avatarUrl: null,
        bio: null,
        status: UserStatus.OFFLINE,
        lastSeenAt: null,
      };
      mockReq.params = { userId: 'other-user' };
      mockService.getPublicProfile.mockResolvedValue(publicProfile);

      await controller.getPublicProfile(req(), res());

      expect(mockService.getPublicProfile).toHaveBeenCalledWith('other-user');
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: publicProfile });
    });
  });

  describe('updateProfile', () => {
    it('deve retornar 400 com dados inválidos', async () => {
      mockReq.body = { displayName: 'a' };

      await controller.updateProfile(req(), res());

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Dados inválidos',
          errors: expect.any(Array),
        })
      );
      expect(mockService.updateProfile).not.toHaveBeenCalled();
    });

    it('deve atualizar o perfil com dados válidos', async () => {
      mockReq.body = { displayName: 'Novo Nome', bio: 'Minha bio' };
      mockService.updateProfile.mockResolvedValue({ ...profile, displayName: 'Novo Nome' });

      await controller.updateProfile(req(), res());

      expect(mockService.updateProfile).toHaveBeenCalledWith(userId, {
        displayName: 'Novo Nome',
        bio: 'Minha bio',
      });
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { ...profile, displayName: 'Novo Nome' },
        message: 'Perfil atualizado com sucesso',
      });
    });
  });

  describe('updateDisplayName', () => {
    it('deve retornar 400 com displayName inválido', async () => {
      mockReq.body = {};

      await controller.updateDisplayName(req(), res());

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Dados inválidos' })
      );
      expect(mockService.updateDisplayName).not.toHaveBeenCalled();
    });

    it('deve atualizar o nome de exibição', async () => {
      mockReq.body = { displayName: 'Novo Nome' };
      mockService.updateDisplayName.mockResolvedValue({ ...profile, displayName: 'Novo Nome' });

      await controller.updateDisplayName(req(), res());

      expect(mockService.updateDisplayName).toHaveBeenCalledWith(userId, 'Novo Nome');
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { ...profile, displayName: 'Novo Nome' },
        message: 'Nome de exibição atualizado com sucesso',
      });
    });
  });

  describe('updateBio', () => {
    it('deve retornar 400 com bio inválida', async () => {
      mockReq.body = { bio: 'a'.repeat(501) };

      await controller.updateBio(req(), res());

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Dados inválidos' })
      );
      expect(mockService.updateBio).not.toHaveBeenCalled();
    });

    it('deve atualizar a bio', async () => {
      mockReq.body = { bio: 'Nova bio' };
      mockService.updateBio.mockResolvedValue({ ...profile, bio: 'Nova bio' });

      await controller.updateBio(req(), res());

      expect(mockService.updateBio).toHaveBeenCalledWith(userId, 'Nova bio');
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { ...profile, bio: 'Nova bio' },
        message: 'Bio atualizada com sucesso',
      });
    });
  });

  describe('uploadAvatar', () => {
    const expectedAvatarFile = {
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };

    it('deve retornar 400 quando nenhum arquivo é enviado', async () => {
      await controller.uploadAvatar(req(), res(), next);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Nenhum arquivo enviado',
      });
      expect(mockService.uploadAvatar).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('deve fazer upload sem options usando objeto vazio', async () => {
      mockReq.file = { ...file, destination: 'x', path: 'y' } as unknown as Express.Multer.File;
      mockService.uploadAvatar.mockResolvedValue(uploadResult);

      await controller.uploadAvatar(req(), res(), next);

      expect(mockService.uploadAvatar).toHaveBeenCalledWith(userId, expectedAvatarFile, {});
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: uploadResult,
        message: 'Avatar atualizado com sucesso',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve fazer parse de options enviadas como string JSON', async () => {
      mockReq.file = file as unknown as Express.Multer.File;
      mockReq.body = { options: JSON.stringify({ cropX: 10, cropY: 20, quality: 90 }) };
      mockService.uploadAvatar.mockResolvedValue(uploadResult);

      await controller.uploadAvatar(req(), res(), next);

      expect(mockService.uploadAvatar).toHaveBeenCalledWith(userId, expectedAvatarFile, {
        cropX: 10,
        cropY: 20,
        quality: 90,
      });
    });

    it('deve aceitar options enviadas como objeto', async () => {
      mockReq.file = file as unknown as Express.Multer.File;
      mockReq.body = { options: { rotate: 90 } };
      mockService.uploadAvatar.mockResolvedValue(uploadResult);

      await controller.uploadAvatar(req(), res(), next);

      expect(mockService.uploadAvatar).toHaveBeenCalledWith(userId, expectedAvatarFile, {
        rotate: 90,
      });
    });

    it('deve ignorar options inválidas e usar objeto vazio', async () => {
      mockReq.file = file as unknown as Express.Multer.File;
      mockReq.body = { options: { quality: 500 } };
      mockService.uploadAvatar.mockResolvedValue(uploadResult);

      await controller.uploadAvatar(req(), res(), next);

      expect(mockService.uploadAvatar).toHaveBeenCalledWith(userId, expectedAvatarFile, {});
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve repassar SyntaxError ao next quando options é JSON malformado', async () => {
      mockReq.file = file as unknown as Express.Multer.File;
      mockReq.body = { options: '{invalid' };

      await controller.uploadAvatar(req(), res(), next);

      expect(next).toHaveBeenCalledWith(expect.any(SyntaxError));
      expect(mockService.uploadAvatar).not.toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('deve converter MulterError via handleMulterError', async () => {
      mockReq.file = file as unknown as Express.Multer.File;
      mockService.uploadAvatar.mockRejectedValue(new multer.MulterError('LIMIT_FILE_SIZE'));

      await controller.uploadAvatar(req(), res(), next);

      expect(next).toHaveBeenCalledTimes(1);
      const forwarded = next.mock.calls[0]?.[0] as unknown;
      expect(forwarded).toBeInstanceOf(FileSizeLimitError);
      expect((forwarded as FileSizeLimitError).message).toContain('5MB');
    });

    it('deve converter erro genérico com name MulterError em FileUploadError', async () => {
      mockReq.file = file as unknown as Express.Multer.File;
      const error = new Error('falha multer');
      error.name = 'MulterError';
      mockService.uploadAvatar.mockRejectedValue(error);

      await controller.uploadAvatar(req(), res(), next);

      const forwarded = next.mock.calls[0]?.[0] as unknown;
      expect(forwarded).toBeInstanceOf(FileUploadError);
      expect((forwarded as FileUploadError).message).toBe('falha multer');
    });

    it('deve repassar outros erros ao next sem transformação', async () => {
      mockReq.file = file as unknown as Express.Multer.File;
      const error = new Error('falha no service');
      mockService.uploadAvatar.mockRejectedValue(error);

      await controller.uploadAvatar(req(), res(), next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('deve repassar valores não-Error ao next', async () => {
      mockReq.file = file as unknown as Express.Multer.File;
      mockService.uploadAvatar.mockRejectedValue('string-error');

      await controller.uploadAvatar(req(), res(), next);

      expect(next).toHaveBeenCalledWith('string-error');
    });

    it('deve repassar erro de autenticação ao next', async () => {
      delete mockReq.user;

      await controller.uploadAvatar(req(), res(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Usuário não autenticado' })
      );
    });
  });

  describe('removeAvatar', () => {
    it('deve retornar mensagem de sucesso quando avatar é removido', async () => {
      const result = { deleted: true, deletedFiles: ['avatars/medium/user-123/a.webp'] };
      mockService.removeAvatar.mockResolvedValue(result);

      await controller.removeAvatar(req(), res());

      expect(mockService.removeAvatar).toHaveBeenCalledWith(userId);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: result,
        message: 'Avatar removido com sucesso',
      });
    });

    it('deve informar que não havia avatar para remover', async () => {
      const result = { deleted: false, deletedFiles: [] };
      mockService.removeAvatar.mockResolvedValue(result);

      await controller.removeAvatar(req(), res());

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: result,
        message: 'Nenhum avatar para remover',
      });
    });
  });

  describe('updateStatus', () => {
    it('deve retornar 400 com status inválido', async () => {
      mockReq.body = { status: 'invisible' };

      await controller.updateStatus(req(), res());

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Status inválido' })
      );
      expect(mockService.updateStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['online', UserStatus.ONLINE],
      ['offline', UserStatus.OFFLINE],
      ['away', UserStatus.AWAY],
      ['busy', UserStatus.BUSY],
    ])('deve mapear status "%s" para UserStatus correspondente', async (input, expected) => {
      mockReq.body = { status: input };
      mockService.updateStatus.mockResolvedValue(undefined);

      await controller.updateStatus(req(), res());

      expect(mockService.updateStatus).toHaveBeenCalledWith(userId, expected);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Status atualizado com sucesso',
      });
    });
  });

  describe('setOnline', () => {
    it('deve definir status online', async () => {
      mockService.setOnline.mockResolvedValue(undefined);

      await controller.setOnline(req(), res());

      expect(mockService.setOnline).toHaveBeenCalledWith(userId);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Status atualizado para online',
      });
    });
  });

  describe('setOffline', () => {
    it('deve definir status offline', async () => {
      mockService.setOffline.mockResolvedValue(undefined);

      await controller.setOffline(req(), res());

      expect(mockService.setOffline).toHaveBeenCalledWith(userId);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Status atualizado para offline',
      });
    });
  });

  describe('getProfileStats', () => {
    it('deve retornar estatísticas do perfil', async () => {
      const stats = {
        contactsCount: 0,
        blockedCount: 0,
        favoritesCount: 0,
        memberSince: new Date('2026-01-01'),
        lastActive: null,
      };
      mockService.getProfileStats.mockResolvedValue(stats);

      await controller.getProfileStats(req(), res());

      expect(mockService.getProfileStats).toHaveBeenCalledWith(userId);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: stats });
    });
  });

  describe('getProfileSettings', () => {
    it('deve retornar configurações do perfil', async () => {
      mockService.getProfileSettings.mockResolvedValue(settings);

      await controller.getProfileSettings(req(), res());

      expect(mockService.getProfileSettings).toHaveBeenCalledWith(userId);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: settings });
    });
  });

  describe('updateProfileSettings', () => {
    it('deve retornar 400 com configurações inválidas', async () => {
      mockReq.body = { theme: 'neon' };

      await controller.updateProfileSettings(req(), res());

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Configurações inválidas' })
      );
      expect(mockService.updateProfileSettings).not.toHaveBeenCalled();
    });

    it('deve atualizar configurações válidas', async () => {
      mockReq.body = { theme: 'dark', notifications: { sound: false } };
      mockService.updateProfileSettings.mockResolvedValue(settings);

      await controller.updateProfileSettings(req(), res());

      expect(mockService.updateProfileSettings).toHaveBeenCalledWith(userId, {
        theme: 'dark',
        notifications: { sound: false },
      });
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: settings,
        message: 'Configurações atualizadas com sucesso',
      });
    });
  });
});
