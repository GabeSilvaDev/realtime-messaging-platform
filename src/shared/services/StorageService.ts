import fs from 'fs/promises';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  type PutObjectCommandInput,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { uploadConfig } from '@/shared/config/upload';

export interface StorageFile {
  key: string;
  content: Buffer;
  contentType: string;
  size: number;
  metadata?: Record<string, string>;
}

export interface StorageUploadOptions {
  contentType: string;
  metadata?: Record<string, string>;
  acl?: 'private' | 'public-read';
  cacheControl?: string;
}

export interface StorageGetOptions {
  range?: string;
}

export interface StorageListOptions {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface StorageListResult {
  files: {
    key: string;
    size: number;
    lastModified: Date;
  }[];
  hasMore: boolean;
  continuationToken?: string;
}

export interface IStorageService {
  upload(key: string, content: Buffer, options: StorageUploadOptions): Promise<string>;
  get(key: string, options?: StorageGetOptions): Promise<StorageFile>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  copy(sourceKey: string, destinationKey: string): Promise<string>;
  move(sourceKey: string, destinationKey: string): Promise<string>;
  list(options?: StorageListOptions): Promise<StorageListResult>;
  getUrl(key: string): string;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

export class StorageUploadError extends AppError {
  constructor(message = 'Falha ao fazer upload do arquivo') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR);
  }
}

export class StorageDownloadError extends AppError {
  constructor(message = 'Falha ao baixar arquivo') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR);
  }
}

export class StorageDeleteError extends AppError {
  constructor(message = 'Falha ao deletar arquivo') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR);
  }
}

export class StorageFileNotFoundError extends AppError {
  constructor(key: string) {
    super(`Arquivo não encontrado: ${key}`, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class LocalStorageService implements IStorageService {
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor(
    basePath: string = uploadConfig.storage.local.basePath,
    baseUrl: string = uploadConfig.storage.local.baseUrl
  ) {
    this.basePath = basePath;
    this.baseUrl = baseUrl;
  }

  async upload(key: string, content: Buffer, options: StorageUploadOptions): Promise<string> {
    const filePath = this.getFilePath(key);
    const directory = path.dirname(filePath);

    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(filePath, content);

      if (options.metadata) {
        const metaPath = `${filePath}.meta.json`;
        await fs.writeFile(
          metaPath,
          JSON.stringify({
            contentType: options.contentType,
            size: content.length,
            metadata: options.metadata,
            createdAt: new Date().toISOString(),
          })
        );
      }

      logger.debug('Arquivo salvo localmente', { key, size: content.length });
      return this.getUrl(key);
    } catch (error) {
      logger.error(
        'Erro ao salvar arquivo local',
        error instanceof Error ? error : new Error(String(error)),
        { key }
      );
      throw new StorageUploadError();
    }
  }

  async get(key: string): Promise<StorageFile> {
    const filePath = this.getFilePath(key);

    try {
      const content = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);

      let contentType = 'application/octet-stream';
      let metadata: Record<string, string> = {};

      try {
        const metaContent = await fs.readFile(`${filePath}.meta.json`, 'utf-8');
        const meta = JSON.parse(metaContent) as {
          contentType?: string;
          metadata?: Record<string, string>;
        };
        contentType = meta.contentType ?? contentType;
        metadata = meta.metadata ?? {};
      } catch {
        /* ignore */
      }

      return {
        key,
        content,
        contentType,
        size: stats.size,
        metadata,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageFileNotFoundError(key);
      }
      logger.error(
        'Erro ao ler arquivo local',
        error instanceof Error ? error : new Error(String(error)),
        { key }
      );
      throw new StorageDownloadError();
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);

    try {
      await fs.unlink(filePath);

      try {
        await fs.unlink(`${filePath}.meta.json`);
      } catch {
        /* ignore */
      }

      logger.debug('Arquivo local deletado', { key });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageFileNotFoundError(key);
      }
      logger.error(
        'Erro ao deletar arquivo local',
        error instanceof Error ? error : new Error(String(error)),
        { key }
      );
      throw new StorageDeleteError();
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<string> {
    const sourcePath = this.getFilePath(sourceKey);
    const destPath = this.getFilePath(destinationKey);
    const destDir = path.dirname(destPath);

    try {
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(sourcePath, destPath);

      try {
        await fs.copyFile(`${sourcePath}.meta.json`, `${destPath}.meta.json`);
      } catch {
        /* ignore */
      }

      return this.getUrl(destinationKey);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageFileNotFoundError(sourceKey);
      }
      logger.error(
        'Erro ao copiar arquivo local',
        error instanceof Error ? error : new Error(String(error)),
        { sourceKey, destinationKey }
      );
      throw new StorageUploadError('Falha ao copiar arquivo');
    }
  }

  async move(sourceKey: string, destinationKey: string): Promise<string> {
    const url = await this.copy(sourceKey, destinationKey);
    await this.delete(sourceKey);
    return url;
  }

  async list(options: StorageListOptions = {}): Promise<StorageListResult> {
    const searchPath =
      options.prefix !== undefined && options.prefix !== ''
        ? path.join(this.basePath, options.prefix)
        : this.basePath;

    try {
      const files: StorageListResult['files'] = [];
      await this.listFilesRecursive(searchPath, this.basePath, files, options.maxKeys);

      return {
        files: files.slice(0, options.maxKeys ?? files.length),
        hasMore:
          options.maxKeys !== undefined && options.maxKeys > 0
            ? files.length > options.maxKeys
            : false,
      };
    } catch (error) {
      logger.error(
        'Erro ao listar arquivos locais',
        error instanceof Error ? error : new Error(String(error))
      );
      return { files: [], hasMore: false };
    }
  }

  private async listFilesRecursive(
    dir: string,
    basePath: string,
    results: StorageListResult['files'],
    maxKeys?: number
  ): Promise<void> {
    if (maxKeys !== undefined && maxKeys > 0 && results.length >= maxKeys) {
      return;
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (maxKeys !== undefined && maxKeys > 0 && results.length >= maxKeys) {
          break;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await this.listFilesRecursive(fullPath, basePath, results, maxKeys);
        } else if (!entry.name.endsWith('.meta.json')) {
          const stats = await fs.stat(fullPath);
          results.push({
            key: path.relative(basePath, fullPath),
            size: stats.size,
            lastModified: stats.mtime,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  getSignedUrl(key: string, _expiresIn?: number): Promise<string> {
    return Promise.resolve(this.getUrl(key));
  }

  private getFilePath(key: string): string {
    return path.join(this.basePath, key);
  }

  async ensureDirectories(): Promise<void> {
    const dirs = [
      path.join(this.basePath, uploadConfig.paths.avatars, 'original'),
      path.join(this.basePath, uploadConfig.paths.avatars, 'large'),
      path.join(this.basePath, uploadConfig.paths.avatars, 'medium'),
      path.join(this.basePath, uploadConfig.paths.avatars, 'small'),
      path.join(this.basePath, uploadConfig.paths.avatars, 'thumbnail'),
      path.join(this.basePath, uploadConfig.paths.images),
      path.join(this.basePath, uploadConfig.paths.documents),
      path.join(this.basePath, uploadConfig.paths.temp),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    logger.info('Diretórios de upload criados', { basePath: this.basePath });
  }
}

export class S3StorageService implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor() {
    const config = uploadConfig.storage.s3;

    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint !== undefined && config.endpoint !== '' && { endpoint: config.endpoint }),
      ...(config.forcePathStyle === true && { forcePathStyle: config.forcePathStyle }),
    });

    this.bucket = config.bucket;
    this.baseUrl =
      config.endpoint !== undefined && config.endpoint !== ''
        ? `${config.endpoint}/${config.bucket}`
        : `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
  }

  async upload(key: string, content: Buffer, options: StorageUploadOptions): Promise<string> {
    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentType: options.contentType,
      Metadata: options.metadata,
      CacheControl: options.cacheControl ?? 'max-age=31536000',
    };

    if (options.acl) {
      params.ACL = options.acl;
    }

    try {
      await this.client.send(new PutObjectCommand(params));
      logger.debug('Arquivo enviado para S3', { bucket: this.bucket, key, size: content.length });
      return this.getUrl(key);
    } catch (error) {
      logger.error(
        'Erro ao enviar para S3',
        error instanceof Error ? error : new Error(String(error)),
        { bucket: this.bucket, key }
      );
      throw new StorageUploadError();
    }
  }

  async get(key: string, options: StorageGetOptions = {}): Promise<StorageFile> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(options.range !== undefined && options.range !== '' && { Range: options.range }),
      });

      const response: GetObjectCommandOutput = await this.client.send(command);

      if (!response.Body) {
        throw new StorageFileNotFoundError(key);
      }

      const content = await this.streamToBuffer(response.Body as Readable);

      return {
        key,
        content,
        contentType: response.ContentType ?? 'application/octet-stream',
        size: response.ContentLength ?? content.length,
        metadata: response.Metadata,
      };
    } catch (error) {
      if ((error as Error).name === 'NoSuchKey') {
        throw new StorageFileNotFoundError(key);
      }
      logger.error(
        'Erro ao baixar do S3',
        error instanceof Error ? error : new Error(String(error)),
        { bucket: this.bucket, key }
      );
      throw new StorageDownloadError();
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      logger.debug('Arquivo deletado do S3', { bucket: this.bucket, key });
    } catch (error) {
      logger.error(
        'Erro ao deletar do S3',
        error instanceof Error ? error : new Error(String(error)),
        { bucket: this.bucket, key }
      );
      throw new StorageDeleteError();
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<string> {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${sourceKey}`,
          Key: destinationKey,
        })
      );
      return this.getUrl(destinationKey);
    } catch (error) {
      if ((error as Error).name === 'NoSuchKey') {
        throw new StorageFileNotFoundError(sourceKey);
      }
      logger.error(
        'Erro ao copiar no S3',
        error instanceof Error ? error : new Error(String(error)),
        { sourceKey, destinationKey }
      );
      throw new StorageUploadError('Falha ao copiar arquivo');
    }
  }

  async move(sourceKey: string, destinationKey: string): Promise<string> {
    const url = await this.copy(sourceKey, destinationKey);
    await this.delete(sourceKey);
    return url;
  }

  async list(options: StorageListOptions = {}): Promise<StorageListResult> {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: options.prefix,
          MaxKeys: options.maxKeys,
          ContinuationToken: options.continuationToken,
        })
      );

      const files = (response.Contents ?? [])
        .filter((item): item is typeof item & { Key: string } => item.Key !== undefined)
        .map((item) => ({
          key: item.Key,
          size: item.Size ?? 0,
          lastModified: item.LastModified ?? new Date(),
        }));

      return {
        files,
        hasMore: response.IsTruncated ?? false,
        continuationToken: response.NextContinuationToken,
      };
    } catch (error) {
      logger.error(
        'Erro ao listar arquivos do S3',
        error instanceof Error ? error : new Error(String(error))
      );
      return { files: [], hasMore: false };
    }
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk as ArrayBuffer));
    }
    return Buffer.concat(chunks);
  }
}

export const createStorageService = (): IStorageService => {
  const provider = uploadConfig.storage.provider;

  if (provider === 's3') {
    return new S3StorageService();
  }

  return new LocalStorageService();
};

export const storageService: IStorageService = createStorageService();
