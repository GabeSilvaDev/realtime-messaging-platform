jest.mock('@/shared/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import type { OutputInfo } from 'sharp';
import { logger } from '@/shared/logger';
import { uploadConfig, type ImageSize } from '@/shared/config/upload';
import type { IStorageService, StorageListResult } from '@/shared/services/StorageService';
import {
  ImageProcessingError,
  type IImageProcessorService,
  type ProcessedImage,
  type ResizeResult,
} from '@/shared/services/ImageProcessorService';
import {
  AvatarService,
  avatarService,
  InvalidAvatarError,
  AvatarTooLargeError,
  UnsupportedAvatarTypeError,
  AvatarProcessingFailedError,
  AvatarNotFoundError,
} from '@/modules/user/services/AvatarService';
import type { AvatarFile } from '@/modules/user/types';

const mockLogger = logger as jest.Mocked<typeof logger>;

const flushPromises = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('AvatarService', () => {
  let storage: jest.Mocked<IStorageService>;
  let imageProcessor: jest.Mocked<IImageProcessorService>;
  let service: AvatarService;

  const userId = 'user-123';
  const avatarIdPattern = /^[0-9a-z]+-[0-9a-f]{8}$/;

  const createFile = (overrides: Partial<AvatarFile> = {}): AvatarFile => ({
    fieldname: 'avatar',
    originalname: 'avatar.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from('fake-image-content'),
    size: 1024,
    ...overrides,
  });

  const resizeResults: ResizeResult[] = uploadConfig.avatar.sizes.map((size) => ({
    name: size.name,
    buffer: Buffer.from(`resized-${size.name}`),
    width: size.width,
    height: size.height,
    size: 100,
  }));

  const processed = (content: string): ProcessedImage => ({
    buffer: Buffer.from(content),
    info: {} as OutputInfo,
    metadata: { width: 10, height: 10, format: 'webp', size: content.length, hasAlpha: false },
  });

  const listResult = (keys: string[]): StorageListResult => ({
    files: keys.map((key) => ({ key, size: 10, lastModified: new Date('2026-01-01') })),
    hasMore: false,
  });

  beforeEach(() => {
    storage = {
      upload: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      copy: jest.fn(),
      move: jest.fn(),
      list: jest.fn(),
      getUrl: jest.fn((key: string) => `/uploads/${key}`),
      getSignedUrl: jest.fn(),
    };

    imageProcessor = {
      getMetadata: jest.fn(),
      resize: jest.fn(),
      resizeMultiple: jest.fn(),
      optimize: jest.fn(),
      convert: jest.fn(),
      crop: jest.fn(),
      rotate: jest.fn(),
      flip: jest.fn(),
      blur: jest.fn(),
      sharpen: jest.fn(),
      grayscale: jest.fn(),
      addWatermark: jest.fn(),
      composite: jest.fn(),
      isValidImage: jest.fn(),
      generateThumbnail: jest.fn(),
      stripMetadata: jest.fn(),
      autoOrient: jest.fn(),
    };

    service = new AvatarService(storage, imageProcessor);
  });

  const setupSuccessfulProcessing = (): void => {
    imageProcessor.isValidImage.mockResolvedValue(true);
    imageProcessor.getMetadata.mockResolvedValue({
      width: 2000,
      height: 1500,
      format: 'png',
      size: 1024,
      hasAlpha: false,
    });
    imageProcessor.resizeMultiple.mockImplementation((_buffer: Buffer, sizes: ImageSize[]) =>
      Promise.resolve(resizeResults.filter((r) => sizes.some((s) => s.name === r.name)))
    );
    imageProcessor.convert.mockImplementation((buffer: Buffer) =>
      Promise.resolve(processed(`converted-${buffer.toString()}`))
    );
    storage.upload.mockImplementation((key: string) => Promise.resolve(`/uploads/${key}`));
    storage.list.mockResolvedValue(listResult([]));
  };

  describe('exports', () => {
    it('deve exportar instância singleton avatarService', () => {
      expect(avatarService).toBeInstanceOf(AvatarService);
    });

    it('deve re-exportar erros de avatar', () => {
      expect(new AvatarNotFoundError()).toBeInstanceOf(Error);
    });
  });

  describe('constructor', () => {
    it('deve usar o formato padrão da configuração quando options não é informado', () => {
      const urls = service.getAvatarUrls(userId, 'abc');

      expect(urls.medium).toBe(
        `/uploads/avatars/medium/${userId}/abc.${uploadConfig.avatar.format}`
      );
    });

    it('deve usar o formato padrão quando options não define format', () => {
      const custom = new AvatarService(storage, imageProcessor, {});

      expect(custom.getAvatarUrls(userId, 'abc').small).toBe(
        `/uploads/avatars/small/${userId}/abc.${uploadConfig.avatar.format}`
      );
    });

    it('deve respeitar o formato informado em options', () => {
      const custom = new AvatarService(storage, imageProcessor, { format: 'png' });

      expect(custom.getAvatarUrls(userId, 'abc').large).toBe(
        `/uploads/avatars/large/${userId}/abc.png`
      );
    });
  });

  describe('validateAvatarFile', () => {
    it('deve aceitar arquivo válido', () => {
      expect(() => service.validateAvatarFile(createFile())).not.toThrow();
    });

    it('deve lançar AvatarTooLargeError quando excede o tamanho máximo', () => {
      const file = createFile({ size: uploadConfig.limits.maxAvatarSize + 1 });

      expect(() => service.validateAvatarFile(file)).toThrow(AvatarTooLargeError);
    });

    it('deve lançar UnsupportedAvatarTypeError para mimetype não permitido', () => {
      const file = createFile({ mimetype: 'application/pdf' });

      expect(() => service.validateAvatarFile(file)).toThrow(UnsupportedAvatarTypeError);
      expect(() => service.validateAvatarFile(file)).toThrow(/application\/pdf/);
    });

    it('deve lançar InvalidAvatarError para buffer vazio', () => {
      const file = createFile({ buffer: Buffer.alloc(0) });

      expect(() => service.validateAvatarFile(file)).toThrow(InvalidAvatarError);
      expect(() => service.validateAvatarFile(file)).toThrow('Arquivo vazio');
    });
  });

  describe('upload', () => {
    it('deve processar e enviar todos os tamanhos com opções padrão', async () => {
      setupSuccessfulProcessing();
      const file = createFile();

      const result = await service.upload(userId, file);

      expect(imageProcessor.isValidImage).toHaveBeenCalledWith(file.buffer);
      expect(imageProcessor.resizeMultiple).toHaveBeenCalledWith(
        file.buffer,
        uploadConfig.avatar.sizes
      );
      expect(imageProcessor.convert).toHaveBeenCalledTimes(uploadConfig.avatar.sizes.length);
      expect(imageProcessor.convert).toHaveBeenCalledWith(
        expect.any(Buffer),
        uploadConfig.avatar.format
      );
      expect(storage.upload).toHaveBeenCalledTimes(uploadConfig.avatar.sizes.length);

      const [key, , uploadOptions] = storage.upload.mock.calls[0] ?? [];
      expect(key).toMatch(
        new RegExp(
          `^avatars/original/${userId}/[0-9a-z]+-[0-9a-f]{8}\\.${uploadConfig.avatar.format}$`
        )
      );
      expect(uploadOptions).toEqual({
        contentType: `image/${uploadConfig.avatar.format}`,
        metadata: {
          userId,
          avatarId: expect.stringMatching(avatarIdPattern),
          sizeName: 'original',
          originalWidth: '2000',
          originalHeight: '1500',
        },
        cacheControl: 'public, max-age=31536000, immutable',
      });

      expect(result.urls.medium).toMatch(
        new RegExp(`^/uploads/avatars/medium/${userId}/[0-9a-z]+-[0-9a-f]{8}\\.`)
      );
      expect(result.metadata).toEqual({
        originalName: file.originalname,
        mimeType: file.mimetype,
        originalSize: file.size,
        processedSizes: resizeResults.map((r) => ({
          name: r.name,
          width: r.width,
          height: r.height,
          size: `converted-resized-${r.name}`.length,
        })),
        uploadedAt: expect.any(Date),
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Avatar uploaded successfully',
        expect.objectContaining({ userId, processedCount: uploadConfig.avatar.sizes.length })
      );
    });

    it('deve processar apenas o primeiro tamanho quando generateAllSizes é false', async () => {
      setupSuccessfulProcessing();

      const result = await service.upload(userId, createFile(), { generateAllSizes: false });

      expect(imageProcessor.resizeMultiple).toHaveBeenCalledWith(expect.any(Buffer), [
        uploadConfig.avatar.sizes[0],
      ]);
      expect(storage.upload).toHaveBeenCalledTimes(1);
      expect(result.metadata.processedSizes).toHaveLength(1);
    });

    it('deve usar o formato informado nas opções', async () => {
      setupSuccessfulProcessing();

      await service.upload(userId, createFile(), { format: 'jpeg' });

      expect(imageProcessor.convert).toHaveBeenCalledWith(expect.any(Buffer), 'jpeg');
      expect(storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/\.jpeg$/),
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'image/jpeg' })
      );
    });

    it('deve remover avatares antigos após upload, excluindo o avatar atual', async () => {
      setupSuccessfulProcessing();
      storage.list.mockResolvedValue(
        listResult([`avatars/medium/${userId}/old-avatar.webp`, 'avatars/medium/other-user/x.webp'])
      );
      storage.delete.mockResolvedValue(undefined);

      await service.upload(userId, createFile());
      await flushPromises();

      expect(storage.delete).toHaveBeenCalledTimes(1);
      expect(storage.delete).toHaveBeenCalledWith(`avatars/medium/${userId}/old-avatar.webp`);
    });

    it('deve registrar warning se a limpeza de avatares antigos rejeitar', async () => {
      setupSuccessfulProcessing();
      const cleanupError = new Error('cleanup failed');
      jest.spyOn(service, 'deleteOldAvatars').mockRejectedValue(cleanupError);

      const result = await service.upload(userId, createFile());
      await flushPromises();

      expect(result.urls).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to cleanup old avatars', {
        userId,
        error: cleanupError,
      });
    });

    it('deve validar o arquivo antes de processar', async () => {
      await expect(service.upload(userId, createFile({ mimetype: 'text/plain' }))).rejects.toThrow(
        UnsupportedAvatarTypeError
      );
      expect(imageProcessor.isValidImage).not.toHaveBeenCalled();
    });

    it('deve lançar InvalidAvatarError quando o conteúdo não é imagem válida', async () => {
      imageProcessor.isValidImage.mockResolvedValue(false);

      await expect(service.upload(userId, createFile())).rejects.toThrow(
        new InvalidAvatarError('O arquivo não é uma imagem válida')
      );
      expect(imageProcessor.getMetadata).not.toHaveBeenCalled();
    });

    it('deve lançar AvatarProcessingFailedError quando não há tamanhos configurados', async () => {
      setupSuccessfulProcessing();
      (service as unknown as { sizes: ImageSize[] }).sizes = [];

      await expect(service.upload(userId, createFile())).rejects.toThrow(
        AvatarProcessingFailedError
      );
      expect(imageProcessor.resizeMultiple).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Avatar upload failed',
        expect.any(AvatarProcessingFailedError),
        { userId }
      );
    });

    it('deve propagar AppError lançado durante o processamento', async () => {
      setupSuccessfulProcessing();
      const appError = new ImageProcessingError('sharp falhou');
      imageProcessor.resizeMultiple.mockRejectedValue(appError);

      await expect(service.upload(userId, createFile())).rejects.toBe(appError);
    });

    it('deve converter erro genérico em AvatarProcessingFailedError', async () => {
      setupSuccessfulProcessing();
      const error = new Error('storage offline');
      storage.upload.mockRejectedValue(error);

      await expect(service.upload(userId, createFile())).rejects.toThrow(
        AvatarProcessingFailedError
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Avatar upload failed', error, { userId });
    });

    it('deve encapsular valores não-Error lançados durante o processamento', async () => {
      setupSuccessfulProcessing();
      imageProcessor.getMetadata.mockRejectedValue('falha-string');

      await expect(service.upload(userId, createFile())).rejects.toThrow(
        AvatarProcessingFailedError
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Avatar upload failed',
        new Error('falha-string'),
        { userId }
      );
    });
  });

  describe('delete', () => {
    it('deve retornar deleted false quando o usuário não possui avatares', async () => {
      storage.list.mockResolvedValue(listResult(['avatars/medium/other-user/a.webp']));

      const result = await service.delete(userId);

      expect(storage.list).toHaveBeenCalledWith({ prefix: uploadConfig.paths.avatars });
      expect(result).toEqual({ deleted: false, deletedFiles: [] });
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('deve deletar arquivos do usuário por diretório e por prefixo', async () => {
      const keys = [
        `avatars/medium/${userId}/a.webp`,
        `avatars/legacy/${userId}_old.webp`,
        'avatars/medium/other-user/b.webp',
      ];
      storage.list.mockResolvedValue(listResult(keys));
      storage.delete.mockResolvedValue(undefined);

      const result = await service.delete(userId);

      expect(storage.delete).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ deleted: true, deletedFiles: [keys[0], keys[1]] });
      expect(mockLogger.info).toHaveBeenCalledWith('Avatars deleted', {
        userId,
        deletedCount: 2,
      });
    });

    it('deve continuar quando a remoção de um arquivo falha', async () => {
      const keys = [`avatars/medium/${userId}/a.webp`, `avatars/small/${userId}/a.webp`];
      storage.list.mockResolvedValue(listResult(keys));
      const deleteError = new Error('delete failed');
      storage.delete.mockRejectedValueOnce(deleteError).mockResolvedValueOnce(undefined);

      const result = await service.delete(userId);

      expect(result).toEqual({ deleted: true, deletedFiles: [keys[1]] });
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to delete avatar file', {
        key: keys[0],
        error: deleteError,
      });
    });

    it('deve retornar deleted false quando todas as remoções falham', async () => {
      storage.list.mockResolvedValue(listResult([`avatars/medium/${userId}/a.webp`]));
      storage.delete.mockRejectedValue(new Error('delete failed'));

      const result = await service.delete(userId);

      expect(result).toEqual({ deleted: false, deletedFiles: [] });
    });

    it('deve retornar deleted false quando a listagem falha com Error', async () => {
      const listError = new Error('list failed');
      storage.list.mockRejectedValue(listError);

      const result = await service.delete(userId);

      expect(result).toEqual({ deleted: false, deletedFiles: [] });
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to delete avatars', listError, {
        userId,
      });
    });

    it('deve encapsular valores não-Error quando a listagem falha', async () => {
      storage.list.mockRejectedValue('list-string-error');

      const result = await service.delete(userId);

      expect(result).toEqual({ deleted: false, deletedFiles: [] });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to delete avatars',
        new Error('list-string-error'),
        { userId }
      );
    });
  });

  describe('deleteOldAvatars', () => {
    const keys = [
      `avatars/medium/${userId}/current.webp`,
      `avatars/medium/${userId}/old.webp`,
      `avatars/legacy/${userId}_older.webp`,
      'avatars/medium/other-user/x.webp',
    ];

    it('deve remover todos os avatares do usuário quando excludePrefix não é informado', async () => {
      storage.list.mockResolvedValue(listResult(keys));
      storage.delete.mockResolvedValue(undefined);

      const count = await service.deleteOldAvatars(userId);

      expect(storage.list).toHaveBeenCalledWith({ prefix: uploadConfig.paths.avatars });
      expect(count).toBe(3);
      expect(mockLogger.debug).toHaveBeenCalledWith('Old avatars cleaned up', {
        userId,
        deletedCount: 3,
      });
    });

    it('deve tratar excludePrefix vazio como ausente', async () => {
      storage.list.mockResolvedValue(listResult(keys));
      storage.delete.mockResolvedValue(undefined);

      const count = await service.deleteOldAvatars(userId, '');

      expect(count).toBe(3);
    });

    it('deve preservar arquivos que contêm excludePrefix', async () => {
      storage.list.mockResolvedValue(listResult(keys));
      storage.delete.mockResolvedValue(undefined);

      const count = await service.deleteOldAvatars(userId, 'current');

      expect(count).toBe(2);
      expect(storage.delete).not.toHaveBeenCalledWith(keys[0]);
    });

    it('deve retornar 0 sem log de debug quando não há arquivos a remover', async () => {
      storage.list.mockResolvedValue(listResult(['avatars/medium/other-user/x.webp']));

      const count = await service.deleteOldAvatars(userId);

      expect(count).toBe(0);
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('deve retornar a contagem parcial e registrar warning em caso de erro', async () => {
      storage.list.mockResolvedValue(listResult(keys));
      const deleteError = new Error('delete failed');
      storage.delete.mockResolvedValueOnce(undefined).mockRejectedValueOnce(deleteError);

      const count = await service.deleteOldAvatars(userId);

      expect(count).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to cleanup old avatars', {
        userId,
        error: deleteError,
      });
    });
  });

  describe('getAvatarUrls', () => {
    it('deve gerar URLs para todos os tamanhos', () => {
      const format = uploadConfig.avatar.format;

      const urls = service.getAvatarUrls(userId, 'abc');

      expect(urls).toEqual({
        original: `/uploads/avatars/original/${userId}/abc.${format}`,
        large: `/uploads/avatars/large/${userId}/abc.${format}`,
        medium: `/uploads/avatars/medium/${userId}/abc.${format}`,
        small: `/uploads/avatars/small/${userId}/abc.${format}`,
        thumbnail: `/uploads/avatars/thumbnail/${userId}/abc.${format}`,
      });
      expect(storage.getUrl).toHaveBeenCalledTimes(5);
    });
  });

  describe('exists', () => {
    it('deve verificar o tamanho medium por padrão', async () => {
      storage.exists.mockResolvedValue(true);

      const result = await service.exists(userId, 'abc');

      expect(result).toBe(true);
      expect(storage.exists).toHaveBeenCalledWith(
        `avatars/medium/${userId}/abc.${uploadConfig.avatar.format}`
      );
    });

    it('deve verificar o tamanho informado', async () => {
      storage.exists.mockResolvedValue(false);

      const result = await service.exists(userId, 'abc', 'thumbnail');

      expect(result).toBe(false);
      expect(storage.exists).toHaveBeenCalledWith(
        `avatars/thumbnail/${userId}/abc.${uploadConfig.avatar.format}`
      );
    });
  });

  describe('getSignedUrl', () => {
    it('deve usar tamanho medium e expiração de 3600s por padrão', async () => {
      storage.getSignedUrl.mockResolvedValue('https://signed.example.com/a');

      const url = await service.getSignedUrl(userId, 'abc');

      expect(url).toBe('https://signed.example.com/a');
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        `avatars/medium/${userId}/abc.${uploadConfig.avatar.format}`,
        3600
      );
    });

    it('deve repassar tamanho e expiração informados', async () => {
      storage.getSignedUrl.mockResolvedValue('https://signed.example.com/b');

      await service.getSignedUrl(userId, 'abc', 'large', 60);

      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        `avatars/large/${userId}/abc.${uploadConfig.avatar.format}`,
        60
      );
    });
  });
});
