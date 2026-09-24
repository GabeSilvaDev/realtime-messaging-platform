jest.mock('@/modules/user/repositories', () => ({
  userRepository: {},
  UserRepository: jest.fn(),
}));
jest.mock('@/modules/presence/services/PresenceService', () => ({ presenceService: {} }));

import type { IAvatarService, IUserRepository } from '@/modules/user/interfaces';
import type { AvatarFile, AvatarUploadResult } from '@/modules/user/types';
import { ProfileService } from '@/modules/user/services/ProfileService';
import { UserEvents, UserStatus } from '@/shared/types';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('ProfileService — user:updated (invalidação do cache do perfil público)', () => {
  const user = {
    id: USER_ID,
    username: 'ana',
    email: 'ana@example.com',
    password: 'hash',
    displayName: 'Ana',
    avatarUrl: null,
    status: UserStatus.OFFLINE,
    lastSeenAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const avatarFile: AvatarFile = {
    fieldname: 'avatar',
    originalname: 'a.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from('x'),
    size: 1,
  };
  const uploadResult = {
    urls: { medium: '/uploads/avatars/medium/a.webp' },
  } as unknown as AvatarUploadResult;

  let users: jest.Mocked<Pick<IUserRepository, 'findById' | 'update'>>;
  let avatar: jest.Mocked<Pick<IAvatarService, 'upload' | 'delete'>>;
  let events: { publish: jest.Mock };
  let service: ProfileService;

  beforeEach(() => {
    users = { findById: jest.fn().mockResolvedValue(user), update: jest.fn() };
    users.update.mockResolvedValue(user);
    avatar = { upload: jest.fn(), delete: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new ProfileService(
      users as unknown as IUserRepository,
      avatar as unknown as IAvatarService,
      events
    );
  });

  it('updateProfile publica os campos gravados', async () => {
    await service.updateProfile(USER_ID, { displayName: 'Ana B', bio: null });

    expect(events.publish).toHaveBeenCalledWith(UserEvents.UPDATED, {
      userId: USER_ID,
      fields: ['displayName', 'bio'],
    });
  });

  it('updateProfile sem campos não publica', async () => {
    await service.updateProfile(USER_ID, {});

    expect(events.publish).not.toHaveBeenCalled();
  });

  it('updateProfile que falha (perfil sumiu) não publica', async () => {
    users.update.mockResolvedValue(null);

    await expect(service.updateProfile(USER_ID, { displayName: 'Ana B' })).rejects.toThrow();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('uploadAvatar publica avatarUrl', async () => {
    avatar.upload.mockResolvedValue(uploadResult);

    await service.uploadAvatar(USER_ID, avatarFile);

    expect(events.publish).toHaveBeenCalledWith(UserEvents.UPDATED, {
      userId: USER_ID,
      fields: ['avatarUrl'],
    });
  });

  it('removeAvatar publica avatarUrl', async () => {
    avatar.delete.mockResolvedValue({ deleted: true, deletedFiles: [] });

    await service.removeAvatar(USER_ID);

    expect(events.publish).toHaveBeenCalledWith(UserEvents.UPDATED, {
      userId: USER_ID,
      fields: ['avatarUrl'],
    });
  });
});
