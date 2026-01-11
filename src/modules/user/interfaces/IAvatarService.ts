import type {
  AvatarFile,
  AvatarUrls,
  AvatarUploadResult,
  AvatarProcessingOptions,
  DeleteAvatarResult,
} from '../types';

export interface IAvatarService {
  upload(
    userId: string,
    file: AvatarFile,
    options?: AvatarProcessingOptions
  ): Promise<AvatarUploadResult>;
  delete(userId: string): Promise<DeleteAvatarResult>;
  deleteOldAvatars(userId: string, excludePrefix?: string): Promise<number>;
  getAvatarUrls(userId: string, avatarId: string): AvatarUrls;
  validateAvatarFile(file: AvatarFile): void;
  exists(userId: string, avatarId: string, size?: string): Promise<boolean>;
}
