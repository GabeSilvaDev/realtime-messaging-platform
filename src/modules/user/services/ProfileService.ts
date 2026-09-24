import type { IPresenceService } from '@/modules/presence/interfaces';
import { presenceService } from '@/modules/presence/services/PresenceService';
import { UserEvents, UserStatus, type ManualPresenceStatus } from '@/shared/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { userRepository } from '../repositories';
import { avatarService } from './AvatarService';
import type { IUserRepository } from '../interfaces';
import type { IAvatarService } from '../interfaces';
import type { IProfileService } from '../interfaces';
import {
  ProfileNotFoundException,
  InvalidAvatarUrlException,
  BioTooLongException,
  DisplayNameTooLongException,
  OfflineStatusNotAllowedException,
} from '../errors';
import { PROFILE_CONSTANTS } from '../constants';
import type {
  UserProfile,
  PublicProfile,
  ProfileUpdateData,
  AvatarFile,
  AvatarUploadResult,
  AvatarProcessingOptions,
  DeleteAvatarResult,
  ProfileStats,
  ProfileSettings,
} from '../types';

export {
  ProfileNotFoundException,
  InvalidAvatarUrlException,
  BioTooLongException,
  DisplayNameTooLongException,
  OfflineStatusNotAllowedException,
} from '../errors';

export type { IProfileService } from '../interfaces';

/** Status legado (`users.status`) → status manual da presença; offline não é manual (400). */
function toManualStatus(status: UserStatus): ManualPresenceStatus {
  switch (status) {
    case UserStatus.ONLINE:
      return 'available';
    case UserStatus.AWAY:
      return 'away';
    case UserStatus.BUSY:
      return 'busy';
    case UserStatus.OFFLINE:
      throw new OfflineStatusNotAllowedException();
  }
}

export class ProfileService implements IProfileService {
  private readonly MAX_BIO_LENGTH = PROFILE_CONSTANTS.MAX_BIO_LENGTH;
  private readonly MAX_DISPLAY_NAME_LENGTH = PROFILE_CONSTANTS.MAX_DISPLAY_NAME_LENGTH;

  constructor(
    private readonly users: IUserRepository = userRepository,
    private readonly avatar: IAvatarService = avatarService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus,
    private readonly presence: Pick<IPresenceService, 'setManualStatus'> = presenceService
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    return this.mapToUserProfile(user as unknown as Record<string, unknown>);
  }

  /**
   * Perfil de outro usuário, sem `status`/`lastSeenAt`: o estado e o visto por último saem só pela
   * presença (`GET /api/presence`), que esconde pares bloqueados.
   */
  async getPublicProfile(userId: string): Promise<PublicProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    const userData = user as unknown as Record<string, unknown>;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: (userData.bio as string | null) ?? null,
    };
  }

  async updateProfile(userId: string, data: ProfileUpdateData): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    if (data.displayName !== undefined && data.displayName !== null) {
      if (data.displayName.length > this.MAX_DISPLAY_NAME_LENGTH) {
        throw new DisplayNameTooLongException(this.MAX_DISPLAY_NAME_LENGTH);
      }
    }

    if (data.bio !== undefined && data.bio !== null) {
      if (data.bio.length > this.MAX_BIO_LENGTH) {
        throw new BioTooLongException(this.MAX_BIO_LENGTH);
      }
    }

    if (data.avatarUrl !== undefined && data.avatarUrl !== null) {
      if (!this.isValidUrl(data.avatarUrl)) {
        throw new InvalidAvatarUrlException();
      }
    }

    const updateData: Record<string, unknown> = {};

    if (data.displayName !== undefined) {
      updateData.displayName = data.displayName;
    }

    if (data.bio !== undefined) {
      updateData.bio = data.bio;
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    const updated = await this.users.update(userId, updateData);
    if (!updated) {
      throw new ProfileNotFoundException();
    }

    const fields = Object.keys(updateData);
    logger.info('Profile updated', { userId, fields });
    await this.publishUpdated(userId, fields);

    return this.mapToUserProfile(updated as unknown as Record<string, unknown>);
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<UserProfile> {
    return this.updateProfile(userId, { displayName });
  }

  async updateBio(userId: string, bio: string | null): Promise<UserProfile> {
    return this.updateProfile(userId, { bio });
  }

  async uploadAvatar(
    userId: string,
    file: AvatarFile,
    options?: AvatarProcessingOptions
  ): Promise<AvatarUploadResult> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    const result = await this.avatar.upload(userId, file, options);

    await this.users.update(userId, { avatarUrl: result.urls.medium });

    logger.info('Avatar uploaded and profile updated', {
      userId,
      avatarUrl: result.urls.medium,
    });
    await this.publishUpdated(userId, ['avatarUrl']);

    return result;
  }

  async updateAvatar(userId: string, avatarUrl: string | null): Promise<UserProfile> {
    if (avatarUrl !== null && !this.isValidUrl(avatarUrl)) {
      throw new InvalidAvatarUrlException();
    }

    return this.updateProfile(userId, { avatarUrl });
  }

  async removeAvatar(userId: string): Promise<DeleteAvatarResult> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    const result = await this.avatar.delete(userId);

    await this.users.update(userId, { avatarUrl: null });

    logger.info('Avatar removed', { userId, filesDeleted: result.deletedFiles.length });
    await this.publishUpdated(userId, ['avatarUrl']);

    return result;
  }

  /**
   * Endpoints legados (`PUT /profile/status`, `POST /profile/online|offline`): delegam ao status
   * manual da presença (`online` → `available`, `away`, `busy`) e não gravam mais `users.status`.
   * `offline` responde 400 — o usuário fica offline ao desconectar.
   */
  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    const manual = toManualStatus(status);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    await this.presence.setManualStatus(userId, manual);
    logger.debug('User status updated', { userId, status: manual });
  }

  async setOnline(userId: string): Promise<void> {
    await this.presence.setManualStatus(userId, 'available');
  }

  setOffline(_userId: string): Promise<void> {
    return Promise.reject(new OfflineStatusNotAllowedException());
  }

  async setAway(userId: string): Promise<void> {
    await this.presence.setManualStatus(userId, 'away');
  }

  async setBusy(userId: string): Promise<void> {
    await this.presence.setManualStatus(userId, 'busy');
  }

  async getProfileStats(userId: string): Promise<ProfileStats> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    return {
      contactsCount: 0,
      blockedCount: 0,
      favoritesCount: 0,
      memberSince: user.createdAt,
      lastActive: user.lastSeenAt ?? user.createdAt,
    };
  }

  async getProfileSettings(userId: string): Promise<ProfileSettings> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    return {
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
    };
  }

  async updateProfileSettings(
    userId: string,
    settings: Partial<ProfileSettings>
  ): Promise<ProfileSettings> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    logger.info('Profile settings updated', { userId, settings: Object.keys(settings) });

    return this.getProfileSettings(userId);
  }

  /** `user:updated` invalida o cache do perfil público; nada gravado ⇒ nada publicado. */
  private async publishUpdated(userId: string, fields: string[]): Promise<void> {
    if (fields.length > 0) {
      await this.events.publish(UserEvents.UPDATED, { userId, fields });
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private mapToUserProfile(user: Record<string, unknown>): UserProfile {
    const displayName = user.displayName as string | null | undefined;
    const avatarUrl = user.avatarUrl as string | null | undefined;
    const bio = user.bio as string | null | undefined;
    const lastSeenAt = user.lastSeenAt as Date | null | undefined;

    return {
      id: user.id as string,
      username: user.username as string,
      email: user.email as string,
      displayName: displayName ?? null,
      avatarUrl: avatarUrl ?? null,
      bio: bio ?? null,
      status: user.status as UserStatus,
      lastSeenAt: lastSeenAt ?? null,
      createdAt: user.createdAt as Date,
    };
  }
}

export const profileService = new ProfileService();
