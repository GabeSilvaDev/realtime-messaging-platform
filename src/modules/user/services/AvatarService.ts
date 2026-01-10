import path from 'path';
import crypto from 'crypto';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { uploadConfig, getAvatarPath } from '@/shared/config/upload';
import { type IStorageService, storageService } from '@/shared/services/StorageService';
import {
  type IImageProcessorService,
  imageProcessorService,
  ImageProcessingError,
  InvalidImageError,
} from '@/shared/services/ImageProcessorService';
import type {
  AvatarFile,
  AvatarUrls,
  AvatarUploadResult,
  AvatarProcessingOptions,
  DeleteAvatarResult,
} from '../types';

export class InvalidAvatarError extends AppError {
  constructor(message = 'Avatar inválido') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class AvatarTooLargeError extends AppError {
  constructor() {
    const maxSizeMB = Math.round(uploadConfig.limits.maxAvatarSize / (1024 * 1024));
    super(
      `Avatar muito grande. Tamanho máximo: ${String(maxSizeMB)}MB`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class UnsupportedAvatarTypeError extends AppError {
  constructor(mimeType: string) {
    super(
      `Tipo de imagem não suportado: ${mimeType}. Use: JPEG, PNG, WebP ou GIF`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class AvatarProcessingFailedError extends AppError {
  constructor() {
    super(
      'Falha ao processar avatar. Tente novamente com outra imagem.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class AvatarNotFoundError extends AppError {
  constructor() {
    super('Avatar não encontrado', HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

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

export class AvatarService implements IAvatarService {
  private readonly allowedMimeTypes = uploadConfig.allowedMimeTypes.avatar;
  private readonly maxSize = uploadConfig.limits.maxAvatarSize;
  private readonly sizes = uploadConfig.avatar.sizes;
  private readonly format: 'webp' | 'jpeg' | 'png';

  constructor(
    private readonly storage: IStorageService = storageService,
    private readonly imageProcessor: IImageProcessorService = imageProcessorService,
    options?: { format?: 'webp' | 'jpeg' | 'png' }
  ) {
    this.format = options?.format ?? uploadConfig.avatar.format;
  }

  async upload(
    userId: string,
    file: AvatarFile,
    options: AvatarProcessingOptions = {}
  ): Promise<AvatarUploadResult> {
    this.validateAvatarFile(file);

    const format = options.format ?? this.format;
    const generateAllSizes = options.generateAllSizes ?? true;

    const isValid = await this.imageProcessor.isValidImage(file.buffer);
    if (!isValid) {
      throw new InvalidAvatarError('O arquivo não é uma imagem válida');
    }

    const avatarId = this.generateAvatarId();

    try {
      const metadata = await this.imageProcessor.getMetadata(file.buffer);

      const firstSize = this.sizes[0];
      if (firstSize === undefined) {
        throw new AvatarProcessingFailedError();
      }
      const sizesToProcess = generateAllSizes ? this.sizes : [firstSize];
      const processedSizes = await this.imageProcessor.resizeMultiple(file.buffer, sizesToProcess);

      const uploadedSizes: AvatarUploadResult['metadata']['processedSizes'] = [];

      for (const processed of processedSizes) {
        const converted = await this.imageProcessor.convert(processed.buffer, format);

        const key = this.getAvatarKey(userId, avatarId, processed.name, format);

        await this.storage.upload(key, converted.buffer, {
          contentType: `image/${format}`,
          metadata: {
            userId,
            avatarId,
            sizeName: processed.name,
            originalWidth: String(metadata.width),
            originalHeight: String(metadata.height),
          },
          cacheControl: 'public, max-age=31536000, immutable',
        });

        uploadedSizes.push({
          name: processed.name,
          width: processed.width,
          height: processed.height,
          size: converted.buffer.length,
        });

        logger.debug('Avatar size uploaded', {
          userId,
          avatarId,
          size: processed.name,
          dimensions: `${String(processed.width)}x${String(processed.height)}`,
        });
      }

      const urls = this.getAvatarUrls(userId, avatarId);

      const result: AvatarUploadResult = {
        urls,
        metadata: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          originalSize: file.size,
          processedSizes: uploadedSizes,
          uploadedAt: new Date(),
        },
      };

      logger.info('Avatar uploaded successfully', {
        userId,
        avatarId,
        originalSize: file.size,
        processedCount: uploadedSizes.length,
      });

      this.deleteOldAvatars(userId, avatarId).catch((error: unknown) => {
        logger.warn('Failed to cleanup old avatars', { userId, error });
      });

      return result;
    } catch (error) {
      logger.error(
        'Avatar upload failed',
        error instanceof Error ? error : new Error(String(error)),
        { userId }
      );

      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof ImageProcessingError || error instanceof InvalidImageError) {
        throw new AvatarProcessingFailedError();
      }

      throw new AvatarProcessingFailedError();
    }
  }

  async delete(userId: string): Promise<DeleteAvatarResult> {
    const deletedFiles: string[] = [];

    try {
      const avatarBasePath = path.join(uploadConfig.paths.avatars);
      const result = await this.storage.list({ prefix: avatarBasePath });

      const userFiles = result.files.filter(
        (file) => file.key.includes(`/${userId}/`) || file.key.includes(`/${userId}_`)
      );

      if (userFiles.length === 0) {
        return { deleted: false, deletedFiles: [] };
      }

      for (const file of userFiles) {
        try {
          await this.storage.delete(file.key);
          deletedFiles.push(file.key);
        } catch (error) {
          logger.warn('Failed to delete avatar file', { key: file.key, error });
        }
      }

      logger.info('Avatars deleted', { userId, deletedCount: deletedFiles.length });

      return {
        deleted: deletedFiles.length > 0,
        deletedFiles,
      };
    } catch (error) {
      logger.error(
        'Failed to delete avatars',
        error instanceof Error ? error : new Error(String(error)),
        { userId }
      );
      return { deleted: false, deletedFiles };
    }
  }

  async deleteOldAvatars(userId: string, excludePrefix?: string): Promise<number> {
    let deletedCount = 0;

    try {
      const result = await this.storage.list({
        prefix: uploadConfig.paths.avatars,
      });

      const userFiles = result.files.filter((file) => {
        const isUserFile = file.key.includes(`/${userId}/`) || file.key.includes(`/${userId}_`);
        const shouldExclude =
          excludePrefix !== undefined && excludePrefix !== '' && file.key.includes(excludePrefix);
        return isUserFile && !shouldExclude;
      });

      for (const file of userFiles) {
        await this.storage.delete(file.key);
        deletedCount++;
      }

      if (deletedCount > 0) {
        logger.debug('Old avatars cleaned up', { userId, deletedCount });
      }
    } catch (error) {
      logger.warn('Failed to cleanup old avatars', { userId, error });
    }

    return deletedCount;
  }

  getAvatarUrls(userId: string, avatarId: string): AvatarUrls {
    const format = this.format;

    return {
      original: this.storage.getUrl(this.getAvatarKey(userId, avatarId, 'original', format)),
      large: this.storage.getUrl(this.getAvatarKey(userId, avatarId, 'large', format)),
      medium: this.storage.getUrl(this.getAvatarKey(userId, avatarId, 'medium', format)),
      small: this.storage.getUrl(this.getAvatarKey(userId, avatarId, 'small', format)),
      thumbnail: this.storage.getUrl(this.getAvatarKey(userId, avatarId, 'thumbnail', format)),
    };
  }

  validateAvatarFile(file: AvatarFile): void {
    if (file.size > this.maxSize) {
      throw new AvatarTooLargeError();
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new UnsupportedAvatarTypeError(file.mimetype);
    }

    if (file.buffer.length === 0) {
      throw new InvalidAvatarError('Arquivo vazio');
    }
  }

  async exists(userId: string, avatarId: string, size = 'medium'): Promise<boolean> {
    const key = this.getAvatarKey(userId, avatarId, size, this.format);
    return this.storage.exists(key);
  }

  private generateAvatarId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}-${random}`;
  }

  private getAvatarKey(userId: string, avatarId: string, sizeName: string, format: string): string {
    return path.join(getAvatarPath(sizeName), userId, `${avatarId}.${format}`);
  }

  async getSignedUrl(
    userId: string,
    avatarId: string,
    size = 'medium',
    expiresIn = 3600
  ): Promise<string> {
    const key = this.getAvatarKey(userId, avatarId, size, this.format);
    return this.storage.getSignedUrl(key, expiresIn);
  }
}

export const avatarService = new AvatarService();
