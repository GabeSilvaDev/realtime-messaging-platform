import crypto from 'crypto';
import path from 'path';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { uploadConfig, isValidMimeType, getMaxFileSize, getTempPath } from '@/shared/config/upload';
import { type IStorageService, storageService, StorageFileNotFoundError } from './StorageService';

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface FileUploadResult {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  path: string;
  uploadedAt: Date;
}

export interface FileUploadOptions {
  directory?: string;
  generateUniqueName?: boolean;
  preserveOriginalName?: boolean;
  maxSize?: number;
  allowedMimeTypes?: string[];
  metadata?: Record<string, string>;
}

export class FileTooLargeError extends AppError {
  constructor(maxSize: number) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    super(
      `Arquivo muito grande. Tamanho máximo permitido: ${String(maxSizeMB)}MB`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class InvalidFileTypeError extends AppError {
  constructor(mimeType: string, allowedTypes: string[]) {
    super(
      `Tipo de arquivo não permitido: ${mimeType}. Tipos permitidos: ${allowedTypes.join(', ')}`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class FileNotFoundError extends AppError {
  constructor(fileId: string) {
    super(`Arquivo não encontrado: ${fileId}`, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class FileUploadError extends AppError {
  constructor(message = 'Erro ao fazer upload do arquivo') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR);
  }
}

export interface IFileService {
  upload(file: UploadedFile, options?: FileUploadOptions): Promise<FileUploadResult>;
  uploadMultiple(files: UploadedFile[], options?: FileUploadOptions): Promise<FileUploadResult[]>;
  delete(filePath: string): Promise<void>;
  deleteMultiple(filePaths: string[]): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  getUrl(filePath: string): string;
  move(sourcePath: string, destinationPath: string): Promise<FileUploadResult>;
  copy(sourcePath: string, destinationPath: string): Promise<FileUploadResult>;
  validateFile(file: UploadedFile, category: 'avatar' | 'image' | 'document'): void;
  generateUniqueFilename(originalName: string): string;
  sanitizeFilename(filename: string): string;
}

export class FileService implements IFileService {
  constructor(private readonly storage: IStorageService = storageService) {}

  async upload(file: UploadedFile, options: FileUploadOptions = {}): Promise<FileUploadResult> {
    const {
      directory = '',
      generateUniqueName = true,
      preserveOriginalName = false,
      maxSize = uploadConfig.limits.maxFileSize,
      allowedMimeTypes,
      metadata = {},
    } = options;

    if (file.size > maxSize) {
      throw new FileTooLargeError(maxSize);
    }

    if (allowedMimeTypes && !allowedMimeTypes.includes(file.mimetype)) {
      throw new InvalidFileTypeError(file.mimetype, allowedMimeTypes);
    }

    let filename: string;
    if (preserveOriginalName) {
      filename = this.sanitizeFilename(file.originalname);
    } else if (generateUniqueName) {
      filename = this.generateUniqueFilename(file.originalname);
    } else {
      filename = this.sanitizeFilename(file.originalname);
    }

    const filePath = directory ? path.join(directory, filename) : filename;
    const fileId = this.generateFileId();

    try {
      const url = await this.storage.upload(filePath, file.buffer, {
        contentType: file.mimetype,
        metadata: {
          ...metadata,
          fileId,
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
        },
      });

      const result: FileUploadResult = {
        id: fileId,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url,
        path: filePath,
        uploadedAt: new Date(),
      };

      logger.info('Arquivo enviado com sucesso', {
        fileId,
        filename,
        size: file.size,
        mimeType: file.mimetype,
      });

      return result;
    } catch (error) {
      logger.error(
        'Erro ao fazer upload do arquivo',
        error instanceof Error ? error : new Error(String(error)),
        { filename }
      );
      throw new FileUploadError();
    }
  }

  async uploadMultiple(
    files: UploadedFile[],
    options: FileUploadOptions = {}
  ): Promise<FileUploadResult[]> {
    const results: FileUploadResult[] = [];

    for (const file of files) {
      const result = await this.upload(file, options);
      results.push(result);
    }

    return results;
  }

  async delete(filePath: string): Promise<void> {
    try {
      await this.storage.delete(filePath);
      logger.info('Arquivo deletado com sucesso', { filePath });
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        throw new FileNotFoundError(filePath);
      }
      logger.error(
        'Erro ao deletar arquivo',
        error instanceof Error ? error : new Error(String(error)),
        { filePath }
      );
      throw error;
    }
  }

  async deleteMultiple(filePaths: string[]): Promise<void> {
    const errors: { path: string; error: Error }[] = [];

    for (const filePath of filePaths) {
      try {
        await this.storage.delete(filePath);
      } catch (error) {
        errors.push({ path: filePath, error: error as Error });
        logger.warn('Falha ao deletar arquivo', { filePath, error });
      }
    }

    if (errors.length > 0 && errors.length === filePaths.length) {
      throw new FileUploadError('Falha ao deletar todos os arquivos');
    }
  }

  async exists(filePath: string): Promise<boolean> {
    return this.storage.exists(filePath);
  }

  getUrl(filePath: string): string {
    return this.storage.getUrl(filePath);
  }

  async move(sourcePath: string, destinationPath: string): Promise<FileUploadResult> {
    try {
      const url = await this.storage.move(sourcePath, destinationPath);
      const filename = path.basename(destinationPath);
      const fileId = this.generateFileId();

      return {
        id: fileId,
        filename,
        originalName: filename,
        mimeType: 'application/octet-stream',
        size: 0,
        url,
        path: destinationPath,
        uploadedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        throw new FileNotFoundError(sourcePath);
      }
      throw error;
    }
  }

  async copy(sourcePath: string, destinationPath: string): Promise<FileUploadResult> {
    try {
      const url = await this.storage.copy(sourcePath, destinationPath);
      const filename = path.basename(destinationPath);
      const fileId = this.generateFileId();

      return {
        id: fileId,
        filename,
        originalName: filename,
        mimeType: 'application/octet-stream',
        size: 0,
        url,
        path: destinationPath,
        uploadedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        throw new FileNotFoundError(sourcePath);
      }
      throw error;
    }
  }

  validateFile(file: UploadedFile, category: 'avatar' | 'image' | 'document'): void {
    const maxSize = getMaxFileSize(category);

    if (file.size > maxSize) {
      throw new FileTooLargeError(maxSize);
    }

    if (!isValidMimeType(file.mimetype, category)) {
      throw new InvalidFileTypeError(file.mimetype, uploadConfig.allowedMimeTypes[category]);
    }
  }

  generateUniqueFilename(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    const timestamp = String(Date.now());
    const random = crypto.randomBytes(8).toString('hex');
    return `${timestamp}-${random}${ext}`;
  }

  sanitizeFilename(filename: string): string {
    let sanitized = path.basename(filename);

    sanitized = sanitized.replace(/\s+/g, '-');

    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '');

    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    const truncatedName = name.substring(0, 100);

    return `${truncatedName}${ext}`;
  }

  private generateFileId(): string {
    return crypto.randomUUID();
  }

  async uploadToTemp(file: UploadedFile): Promise<FileUploadResult> {
    return this.upload(file, {
      directory: getTempPath(),
      generateUniqueName: true,
    });
  }

  async moveFromTemp(tempPath: string, destinationPath: string): Promise<FileUploadResult> {
    return this.move(tempPath, destinationPath);
  }

  async cleanupTemp(olderThanHours = 24): Promise<number> {
    const tempPath = getTempPath();
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    let deletedCount = 0;

    try {
      const result = await this.storage.list({ prefix: tempPath });

      for (const file of result.files) {
        if (file.lastModified < cutoffDate) {
          try {
            await this.storage.delete(file.key);
            deletedCount++;
          } catch {
            /* ignore */
          }
        }
      }

      logger.info('Limpeza de arquivos temporários concluída', { deletedCount });
    } catch (error) {
      logger.error(
        'Erro ao limpar arquivos temporários',
        error instanceof Error ? error : new Error(String(error))
      );
    }

    return deletedCount;
  }
}

export const fileService = new FileService();
