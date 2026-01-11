import type { UserStatus } from '@/shared/types';
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
