import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { UserStatus } from '@/shared/types';
import { userRepository, type IUserRepository } from '../repositories';
import type { UpdateProfileDTO, UserProfile } from '../types';

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

export class ProfileService {
  constructor(private readonly users: IUserRepository = userRepository) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: null,
      status: user.status,
      lastSeenAt: user.lastSeenAt,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, data: UpdateProfileDTO): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
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

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    const updated = await this.users.update(userId, updateData);
    if (!updated) {
      throw new ProfileNotFoundException();
    }

    return {
      id: updated.id,
      username: updated.username,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      bio: null,
      status: updated.status,
      lastSeenAt: updated.lastSeenAt,
      createdAt: updated.createdAt,
    };
  }

  async updateAvatar(userId: string, avatarUrl: string | null): Promise<UserProfile> {
    if (avatarUrl !== null && !this.isValidUrl(avatarUrl)) {
      throw new InvalidAvatarUrlException();
    }

    return this.updateProfile(userId, { avatarUrl });
  }

  async removeAvatar(userId: string): Promise<UserProfile> {
    return this.updateProfile(userId, { avatarUrl: null });
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<UserProfile> {
    return this.updateProfile(userId, { displayName });
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    await this.users.updateStatus(userId, status);
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

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

export const profileService = new ProfileService();
