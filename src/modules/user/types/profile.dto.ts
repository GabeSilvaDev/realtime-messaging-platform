import type { UserStatus } from '@/shared/types';
import type { AvatarUrls, AvatarProcessingOptions } from './profile.types';

export interface UpdateDisplayNameDTO {
  displayName: string | null;
}

export interface UpdateBioDTO {
  bio: string | null;
}

export interface UpdateStatusDTO {
  status: UserStatus;
}

export interface UploadAvatarDTO {
  file: {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
  };
  options?: AvatarProcessingOptions;
}

export interface AvatarResponseDTO {
  urls: AvatarUrls;
  metadata: {
    originalName: string;
    mimeType: string;
    originalSize: number;
    processedSizes: {
      name: string;
      width: number;
      height: number;
      size: number;
    }[];
    uploadedAt: string;
  };
}

export interface DeleteAvatarResponseDTO {
  success: boolean;
  message: string;
}

export interface ProfileResponseDTO {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PublicProfileResponseDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  status: string;
  lastSeenAt: string | null;
}

export interface ProfileStatsDTO {
  contactsCount: number;
  blockedCount: number;
  favoritesCount: number;
  memberSince: string;
  lastActive: string | null;
}

export interface ProfileWithStatsResponseDTO extends ProfileResponseDTO {
  stats: ProfileStatsDTO;
}

export interface ProfileVisibilityDTO {
  showEmail?: boolean;
  showLastSeen?: boolean;
  showStatus?: boolean;
  showBio?: boolean;
}

export interface NotificationSettingsDTO {
  email?: boolean;
  push?: boolean;
  sound?: boolean;
}

export interface UpdateProfileSettingsDTO {
  visibility?: ProfileVisibilityDTO;
  notifications?: NotificationSettingsDTO;
  theme?: 'light' | 'dark' | 'system';
  language?: string;
}

export interface ProfileSettingsResponseDTO {
  visibility: {
    showEmail: boolean;
    showLastSeen: boolean;
    showStatus: boolean;
    showBio: boolean;
  };
  notifications: {
    email: boolean;
    push: boolean;
    sound: boolean;
  };
  theme: 'light' | 'dark' | 'system';
  language: string;
}

export interface UserPresenceDTO {
  userId: string;
  status: string;
  lastSeenAt: string | null;
}

export interface UpdatePresenceDTO {
  status: UserStatus;
}

export interface BulkPresenceResponseDTO {
  users: UserPresenceDTO[];
}
