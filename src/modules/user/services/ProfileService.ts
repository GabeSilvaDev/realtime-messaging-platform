import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { UserStatus } from '@/shared/types';
import { logger } from '@/shared/logger';
import { userRepository, type IUserRepository } from '../repositories';
import { avatarService, type IAvatarService } from './AvatarService';
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

export class ProfileNotFoundException extends AppError {
  constructor(message = 'Perfil não encontrado') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.USER_NOT_FOUND);
  }
}

export class InvalidAvatarUrlException extends AppError {
  constructor(message = 'URL do avatar inválida') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class BioTooLongException extends AppError {
  constructor(maxLength = 500) {
    super(
      `Bio muito longa. Máximo: ${String(maxLength)} caracteres`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class DisplayNameTooLongException extends AppError {
  constructor(maxLength = 100) {
    super(
      `Nome de exibição muito longo. Máximo: ${String(maxLength)} caracteres`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export interface IProfileService {
  getProfile(userId: string): Promise<UserProfile>;
  getPublicProfile(userId: string): Promise<PublicProfile>;
  updateProfile(userId: string, data: ProfileUpdateData): Promise<UserProfile>;
  updateDisplayName(userId: string, displayName: string | null): Promise<UserProfile>;
  updateBio(userId: string, bio: string | null): Promise<UserProfile>;
  uploadAvatar(
    userId: string,
    file: AvatarFile,
    options?: AvatarProcessingOptions
  ): Promise<AvatarUploadResult>;
  updateAvatar(userId: string, avatarUrl: string | null): Promise<UserProfile>;
  removeAvatar(userId: string): Promise<DeleteAvatarResult>;
  updateStatus(userId: string, status: UserStatus): Promise<void>;
  setOnline(userId: string): Promise<void>;
  setOffline(userId: string): Promise<void>;
  setAway(userId: string): Promise<void>;
  setBusy(userId: string): Promise<void>;
  getProfileStats(userId: string): Promise<ProfileStats>;
  getProfileSettings(userId: string): Promise<ProfileSettings>;
  updateProfileSettings(
    userId: string,
    settings: Partial<ProfileSettings>
  ): Promise<ProfileSettings>;
}

export class ProfileService implements IProfileService {
  private readonly MAX_BIO_LENGTH = 500;
  private readonly MAX_DISPLAY_NAME_LENGTH = 100;

  constructor(
    private readonly users: IUserRepository = userRepository,
    private readonly avatar: IAvatarService = avatarService
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    return this.mapToUserProfile(user as unknown as Record<string, unknown>);
  }

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
      status: user.status,
      lastSeenAt: user.lastSeenAt,
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

    logger.info('Profile updated', { userId, fields: Object.keys(updateData) });

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

    return result;
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    await this.users.updateStatus(userId, status);
    logger.debug('User status updated', { userId, status });
  }

  async setOnline(userId: string): Promise<void> {
    await this.users.updateStatus(userId, UserStatus.ONLINE);
  }

  async setOffline(userId: string): Promise<void> {
    await this.users.updateStatus(userId, UserStatus.OFFLINE);
    await this.users.updateLastSeen(userId);
  }

  async setAway(userId: string): Promise<void> {
    await this.users.updateStatus(userId, UserStatus.AWAY);
  }

  async setBusy(userId: string): Promise<void> {
    await this.users.updateStatus(userId, UserStatus.BUSY);
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
