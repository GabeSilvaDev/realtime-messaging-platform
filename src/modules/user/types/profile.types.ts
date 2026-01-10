import type { UserStatus } from '@/shared/types';

export interface ProfileUpdateData {
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  lastSeenAt: Date | null;
}

export interface AvatarUrls {
  original: string;
  large: string;
  medium: string;
  small: string;
  thumbnail: string;
}

export interface AvatarUploadResult {
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
    uploadedAt: Date;
  };
}

export interface ProfileStats {
  contactsCount: number;
  blockedCount: number;
  favoritesCount: number;
  memberSince: Date;
  lastActive: Date | null;
}

export interface ProfileVisibility {
  showEmail: boolean;
  showLastSeen: boolean;
  showStatus: boolean;
  showBio: boolean;
}

export interface ProfileSettings {
  visibility: ProfileVisibility;
  notifications: {
    email: boolean;
    push: boolean;
    sound: boolean;
  };
  theme: 'light' | 'dark' | 'system';
  language: string;
}

export interface ProfileWithStats extends UserProfile {
  stats: ProfileStats;
}

export interface AvatarFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface AvatarProcessingOptions {
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  generateAllSizes?: boolean;
}

export interface DeleteAvatarResult {
  deleted: boolean;
  deletedFiles: string[];
}
