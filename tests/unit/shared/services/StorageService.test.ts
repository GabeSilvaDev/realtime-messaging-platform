jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  access: jest.fn(),
  copyFile: jest.fn(),
  readdir: jest.fn(),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  CopyObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@/shared/logger', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Objeto mutável: StorageService lê uploadConfig em tempo de chamada
// (construtores e createStorageService), então basta alterar os campos no teste.
jest.mock('@/shared/config/upload', () => ({
  uploadConfig: {
    storage: {
      provider: 'local',
      local: { basePath: '/base', baseUrl: '/uploads' },
      s3: {
        bucket: 'bucket',
        region: 'us-east-1',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        endpoint: undefined,
        forcePathStyle: false,
      },
    },
    paths: { avatars: 'avatars', images: 'images', documents: 'documents', temp: 'temp' },
  },
}));

import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { uploadConfig, type UploadConfig } from '@/shared/config/upload';
import {
  LocalStorageService,
  S3StorageService,
  StorageUploadError,
  StorageDownloadError,
  StorageDeleteError,
  StorageFileNotFoundError,
  createStorageService,
  storageService,
} from '@/shared/services/StorageService';

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedLogger = logger as unknown as { error: jest.Mock; debug: jest.Mock; info: jest.Mock };
const mockedS3Client = S3Client as unknown as jest.Mock;
const mockedGetSignedUrl = getSignedUrl as jest.Mock;
const mockSend = jest.fn();

const s3Defaults: UploadConfig['storage']['s3'] = {
  bucket: 'bucket',
  region: 'us-east-1',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  endpoint: undefined,
  forcePathStyle: false,
};

const errnoError = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(code), { code });

const namedError = (name: string): Error => Object.assign(new Error(name), { name });

const dirent = (
  name: string,
  isDirectory: boolean
): { name: string; isDirectory: () => boolean } => ({
  name,
  isDirectory: () => isDirectory,
});

beforeEach(() => {
  uploadConfig.storage.provider = 'local';
  uploadConfig.storage.s3 = { ...s3Defaults };
  mockedS3Client.mockImplementation(() => ({ send: mockSend }));
});

describe('classes de erro', () => {
  it('deve criar StorageUploadError com mensagem padrão e customizada', () => {
    expect(new StorageUploadError().message).toBe('Falha ao fazer upload do arquivo');
    expect(new StorageUploadError('x').message).toBe('x');
    expect(new StorageUploadError().statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(new StorageUploadError().code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('deve criar StorageDownloadError com mensagem padrão e customizada', () => {
    expect(new StorageDownloadError().message).toBe('Falha ao baixar arquivo');
    expect(new StorageDownloadError('x').message).toBe('x');
  });

  it('deve criar StorageDeleteError com mensagem padrão e customizada', () => {
    expect(new StorageDeleteError().message).toBe('Falha ao deletar arquivo');
    expect(new StorageDeleteError('x').message).toBe('x');
  });

  it('deve criar StorageFileNotFoundError com a chave na mensagem', () => {
    const error = new StorageFileNotFoundError('a/b.png');

    expect(error.message).toBe('Arquivo não encontrado: a/b.png');
    expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('createStorageService', () => {
  it('deve exportar um singleton local criado no import (provider padrão)', () => {
    expect(storageService).toBeInstanceOf(LocalStorageService);
  });

  it('deve criar LocalStorageService quando o provider é local', () => {
    expect(createStorageService()).toBeInstanceOf(LocalStorageService);
  });

  it('deve criar S3StorageService quando o provider é s3', () => {
    uploadConfig.storage.provider = 's3';

    expect(createStorageService()).toBeInstanceOf(S3StorageService);
  });
});

describe('LocalStorageService', () => {
  const basePath = '/base';
  let service: LocalStorageService;

  beforeEach(() => {
    service = new LocalStorageService(basePath, '/uploads');
  });

  describe('constructor', () => {
    it('deve usar basePath e baseUrl do uploadConfig por padrão', () => {
      const defaultService = new LocalStorageService();

      expect(defaultService.getUrl('a.png')).toBe('/uploads/a.png');
    });
  });

  describe('upload', () => {
    it('deve criar o diretório e salvar o arquivo sem metadata', async () => {
      const content = Buffer.from('data');

      const url = await service.upload('images/a.png', content, { contentType: 'image/png' });

      expect(url).toBe('/uploads/images/a.png');
      expect(mockedFs.mkdir).toHaveBeenCalledWith(path.join(basePath, 'images'), {
        recursive: true,
      });
      expect(mockedFs.writeFile).toHaveBeenCalledTimes(1);
      expect(mockedFs.writeFile).toHaveBeenCalledWith(path.join(basePath, 'images/a.png'), content);
      expect(mockedLogger.debug).toHaveBeenCalledWith('Arquivo salvo localmente', {
        key: 'images/a.png',
        size: content.length,
      });
    });

    it('deve salvar o arquivo .meta.json quando há metadata', async () => {
      const content = Buffer.from('data');

      await service.upload('a.png', content, {
        contentType: 'image/png',
        metadata: { owner: 'u1' },
      });

      expect(mockedFs.writeFile).toHaveBeenCalledTimes(2);
      const [metaPath, metaJson] = mockedFs.writeFile.mock.calls[1] as [string, string];
      expect(metaPath).toBe(`${path.join(basePath, 'a.png')}.meta.json`);
      expect(JSON.parse(metaJson)).toEqual({
        contentType: 'image/png',
        size: content.length,
        metadata: { owner: 'u1' },
        createdAt: expect.any(String),
      });
    });

    it('deve logar e lançar StorageUploadError quando a escrita falha', async () => {
      const error = new Error('disk full');
      mockedFs.writeFile.mockRejectedValue(error);

      await expect(
        service.upload('a.png', Buffer.from('x'), { contentType: 'image/png' })
      ).rejects.toBeInstanceOf(StorageUploadError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao salvar arquivo local', error, {
        key: 'a.png',
      });
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockedFs.mkdir.mockRejectedValue('raw');

      await expect(
        service.upload('a.png', Buffer.from('x'), { contentType: 'image/png' })
      ).rejects.toBeInstanceOf(StorageUploadError);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Erro ao salvar arquivo local',
        new Error('raw'),
        {
          key: 'a.png',
        }
      );
    });
  });

  describe('get', () => {
    const content = Buffer.from('file-content');

    beforeEach(() => {
      mockedFs.stat.mockResolvedValue({ size: 12 } as Awaited<ReturnType<typeof fs.stat>>);
    });

    it('deve retornar o arquivo com contentType e metadata do .meta.json', async () => {
      mockedFs.readFile.mockImplementation(((filePath: string) =>
        Promise.resolve(
          filePath.endsWith('.meta.json')
            ? JSON.stringify({ contentType: 'image/png', metadata: { owner: 'u1' } })
            : content
        )) as unknown as typeof fs.readFile);

      const result = await service.get('a.png');

      expect(mockedFs.readFile).toHaveBeenCalledWith(path.join(basePath, 'a.png'));
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        `${path.join(basePath, 'a.png')}.meta.json`,
        'utf-8'
      );
      expect(result).toEqual({
        key: 'a.png',
        content,
        contentType: 'image/png',
        size: 12,
        metadata: { owner: 'u1' },
      });
    });

    it('deve usar valores padrão quando o .meta.json não tem os campos', async () => {
      mockedFs.readFile.mockImplementation(((filePath: string) =>
        Promise.resolve(
          filePath.endsWith('.meta.json') ? '{}' : content
        )) as unknown as typeof fs.readFile);

      const result = await service.get('a.png');

      expect(result.contentType).toBe('application/octet-stream');
      expect(result.metadata).toEqual({});
    });

    it('deve ignorar a ausência do .meta.json', async () => {
      mockedFs.readFile.mockImplementation(((filePath: string) =>
        filePath.endsWith('.meta.json')
          ? Promise.reject(errnoError('ENOENT'))
          : Promise.resolve(content)) as unknown as typeof fs.readFile);

      const result = await service.get('a.png');

      expect(result.contentType).toBe('application/octet-stream');
      expect(result.metadata).toEqual({});
    });

    it('deve lançar StorageFileNotFoundError quando o arquivo não existe', async () => {
      mockedFs.readFile.mockRejectedValue(errnoError('ENOENT'));

      await expect(service.get('missing.png')).rejects.toThrow(
        new StorageFileNotFoundError('missing.png')
      );
      expect(mockedLogger.error).not.toHaveBeenCalled();
    });

    it('deve logar e lançar StorageDownloadError para outros erros', async () => {
      const error = errnoError('EACCES');
      mockedFs.readFile.mockRejectedValue(error);

      await expect(service.get('a.png')).rejects.toBeInstanceOf(StorageDownloadError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao ler arquivo local', error, {
        key: 'a.png',
      });
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockedFs.readFile.mockRejectedValue('raw');

      await expect(service.get('a.png')).rejects.toBeInstanceOf(StorageDownloadError);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Erro ao ler arquivo local',
        new Error('raw'),
        {
          key: 'a.png',
        }
      );
    });
  });

  describe('delete', () => {
    it('deve remover o arquivo e o .meta.json', async () => {
      await service.delete('a.png');

      expect(mockedFs.unlink).toHaveBeenNthCalledWith(1, path.join(basePath, 'a.png'));
      expect(mockedFs.unlink).toHaveBeenNthCalledWith(
        2,
        `${path.join(basePath, 'a.png')}.meta.json`
      );
      expect(mockedLogger.debug).toHaveBeenCalledWith('Arquivo local deletado', { key: 'a.png' });
    });

    it('deve ignorar falha ao remover o .meta.json', async () => {
      mockedFs.unlink.mockResolvedValueOnce(undefined).mockRejectedValueOnce(errnoError('ENOENT'));

      await expect(service.delete('a.png')).resolves.toBeUndefined();
    });

    it('deve lançar StorageFileNotFoundError quando o arquivo não existe', async () => {
      mockedFs.unlink.mockRejectedValue(errnoError('ENOENT'));

      await expect(service.delete('a.png')).rejects.toBeInstanceOf(StorageFileNotFoundError);
    });

    it('deve logar e lançar StorageDeleteError para outros erros', async () => {
      const error = errnoError('EPERM');
      mockedFs.unlink.mockRejectedValue(error);

      await expect(service.delete('a.png')).rejects.toBeInstanceOf(StorageDeleteError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao deletar arquivo local', error, {
        key: 'a.png',
      });
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockedFs.unlink.mockRejectedValue('raw');

      await expect(service.delete('a.png')).rejects.toBeInstanceOf(StorageDeleteError);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Erro ao deletar arquivo local',
        new Error('raw'),
        { key: 'a.png' }
      );
    });
  });

  describe('exists', () => {
    it('deve retornar true quando o arquivo é acessível', async () => {
      mockedFs.access.mockResolvedValue(undefined);

      await expect(service.exists('a.png')).resolves.toBe(true);
      expect(mockedFs.access).toHaveBeenCalledWith(path.join(basePath, 'a.png'));
    });

    it('deve retornar false quando o acesso falha', async () => {
      mockedFs.access.mockRejectedValue(errnoError('ENOENT'));

      await expect(service.exists('a.png')).resolves.toBe(false);
    });
  });

  describe('copy', () => {
    it('deve copiar o arquivo e o .meta.json', async () => {
      const url = await service.copy('a.png', 'dir/b.png');

      expect(url).toBe('/uploads/dir/b.png');
      expect(mockedFs.mkdir).toHaveBeenCalledWith(path.join(basePath, 'dir'), { recursive: true });
      expect(mockedFs.copyFile).toHaveBeenNthCalledWith(
        1,
        path.join(basePath, 'a.png'),
        path.join(basePath, 'dir/b.png')
      );
      expect(mockedFs.copyFile).toHaveBeenNthCalledWith(
        2,
        `${path.join(basePath, 'a.png')}.meta.json`,
        `${path.join(basePath, 'dir/b.png')}.meta.json`
      );
    });

    it('deve ignorar falha ao copiar o .meta.json', async () => {
      mockedFs.copyFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(errnoError('ENOENT'));

      await expect(service.copy('a.png', 'b.png')).resolves.toBe('/uploads/b.png');
    });

    it('deve lançar StorageFileNotFoundError com a chave de origem', async () => {
      mockedFs.copyFile.mockRejectedValue(errnoError('ENOENT'));

      await expect(service.copy('a.png', 'b.png')).rejects.toThrow(
        new StorageFileNotFoundError('a.png')
      );
    });

    it('deve logar e lançar StorageUploadError para outros erros', async () => {
      const error = errnoError('EACCES');
      mockedFs.copyFile.mockRejectedValue(error);

      await expect(service.copy('a.png', 'b.png')).rejects.toThrow(
        new StorageUploadError('Falha ao copiar arquivo')
      );
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao copiar arquivo local', error, {
        sourceKey: 'a.png',
        destinationKey: 'b.png',
      });
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockedFs.mkdir.mockRejectedValue('raw');

      await expect(service.copy('a.png', 'b.png')).rejects.toBeInstanceOf(StorageUploadError);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Erro ao copiar arquivo local',
        new Error('raw'),
        { sourceKey: 'a.png', destinationKey: 'b.png' }
      );
    });
  });

  describe('move', () => {
    it('deve copiar e depois deletar a origem', async () => {
      const copySpy = jest.spyOn(service, 'copy');
      const deleteSpy = jest.spyOn(service, 'delete');

      const url = await service.move('a.png', 'b.png');

      expect(url).toBe('/uploads/b.png');
      expect(copySpy).toHaveBeenCalledWith('a.png', 'b.png');
      expect(deleteSpy).toHaveBeenCalledWith('a.png');
    });

    it('não deve deletar a origem quando a cópia falha', async () => {
      mockedFs.copyFile.mockRejectedValue(errnoError('ENOENT'));

      await expect(service.move('a.png', 'b.png')).rejects.toBeInstanceOf(StorageFileNotFoundError);
      expect(mockedFs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const mtime = new Date('2024-01-01T00:00:00Z');

    beforeEach(() => {
      mockedFs.stat.mockResolvedValue({ size: 10, mtime } as Awaited<ReturnType<typeof fs.stat>>);
    });

    const mockTree = (tree: Record<string, ReturnType<typeof dirent>[]>): void => {
      mockedFs.readdir.mockImplementation(((dir: string) =>
        dir in tree
          ? Promise.resolve(tree[dir])
          : Promise.reject(errnoError('ENOENT'))) as unknown as typeof fs.readdir);
    };

    it('deve listar recursivamente a partir do basePath ignorando .meta.json', async () => {
      mockTree({
        [basePath]: [dirent('a.png', false), dirent('a.png.meta.json', false), dirent('sub', true)],
        [path.join(basePath, 'sub')]: [dirent('b.png', false)],
      });

      const result = await service.list();

      expect(mockedFs.readdir).toHaveBeenCalledWith(basePath, { withFileTypes: true });
      expect(result).toEqual({
        files: [
          { key: 'a.png', size: 10, lastModified: mtime },
          { key: path.join('sub', 'b.png'), size: 10, lastModified: mtime },
        ],
        hasMore: false,
      });
    });

    it('deve listar a partir do prefixo informado', async () => {
      mockTree({ [path.join(basePath, 'avatars')]: [dirent('c.png', false)] });

      const result = await service.list({ prefix: 'avatars' });

      expect(result.files).toEqual([
        { key: path.join('avatars', 'c.png'), size: 10, lastModified: mtime },
      ]);
    });

    it('deve tratar prefixo vazio como basePath', async () => {
      mockTree({ [basePath]: [dirent('a.png', false)] });

      const result = await service.list({ prefix: '' });

      expect(mockedFs.readdir).toHaveBeenCalledWith(basePath, { withFileTypes: true });
      expect(result.files).toHaveLength(1);
    });

    it('deve parar no maxKeys dentro do laço', async () => {
      mockTree({
        [basePath]: [dirent('a.png', false), dirent('b.png', false), dirent('c.png', false)],
      });

      const result = await service.list({ maxKeys: 2 });

      expect(result.files.map((f) => f.key)).toEqual(['a.png', 'b.png']);
      // O recursivo nunca coleta mais que maxKeys, então hasMore é sempre false.
      expect(result.hasMore).toBe(false);
    });

    it('não deve descer em subdiretório quando maxKeys já foi atingido', async () => {
      mockTree({
        [basePath]: [dirent('a.png', false), dirent('sub', true)],
        [path.join(basePath, 'sub')]: [dirent('b.png', false)],
      });

      mockedFs.readdir.mockClear();
      const result = await service.list({ maxKeys: 1 });

      expect(result.files.map((f) => f.key)).toEqual(['a.png']);
      expect(mockedFs.readdir).toHaveBeenCalledTimes(1);
    });

    it('deve ignorar o limite quando maxKeys é 0 (e retornar lista vazia pelo slice)', async () => {
      mockTree({ [basePath]: [dirent('a.png', false), dirent('b.png', false)] });

      const result = await service.list({ maxKeys: 0 });

      expect(mockedFs.stat).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ files: [], hasMore: false });
    });

    it('deve retornar lista vazia quando o diretório não pode ser lido', async () => {
      mockedFs.readdir.mockRejectedValue(errnoError('ENOENT'));

      await expect(service.list()).resolves.toEqual({ files: [], hasMore: false });
    });
  });

  describe('getSignedUrl', () => {
    it('deve retornar a URL pública (sem assinatura) no storage local', async () => {
      await expect(service.getSignedUrl('a.png', 60)).resolves.toBe('/uploads/a.png');
    });
  });

  describe('ensureDirectories', () => {
    it('deve criar todos os diretórios de upload', async () => {
      await service.ensureDirectories();

      const created = mockedFs.mkdir.mock.calls.map(([dir]) => dir);
      expect(created).toEqual([
        path.join(basePath, 'avatars', 'original'),
        path.join(basePath, 'avatars', 'large'),
        path.join(basePath, 'avatars', 'medium'),
        path.join(basePath, 'avatars', 'small'),
        path.join(basePath, 'avatars', 'thumbnail'),
        path.join(basePath, 'images'),
        path.join(basePath, 'documents'),
        path.join(basePath, 'temp'),
      ]);
      expect(mockedFs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(mockedLogger.info).toHaveBeenCalledWith('Diretórios de upload criados', {
        basePath,
      });
    });
  });
});

describe('S3StorageService', () => {
  let service: S3StorageService;

  beforeEach(() => {
    service = new S3StorageService();
  });

  describe('constructor', () => {
    it('deve criar o client AWS padrão sem endpoint e sem forcePathStyle', () => {
      expect(mockedS3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
      });
      expect(service.getUrl('a.png')).toBe('https://bucket.s3.us-east-1.amazonaws.com/a.png');
    });

    it('deve tratar endpoint vazio como ausente', () => {
      uploadConfig.storage.s3.endpoint = '';

      const s3 = new S3StorageService();

      expect(mockedS3Client).toHaveBeenLastCalledWith({
        region: 'us-east-1',
        credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
      });
      expect(s3.getUrl('a.png')).toBe('https://bucket.s3.us-east-1.amazonaws.com/a.png');
    });

    it('deve usar endpoint customizado e forcePathStyle (ex.: MinIO)', () => {
      uploadConfig.storage.s3.endpoint = 'http://localhost:9000';
      uploadConfig.storage.s3.forcePathStyle = true;

      const s3 = new S3StorageService();

      expect(mockedS3Client).toHaveBeenLastCalledWith({
        region: 'us-east-1',
        credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
      });
      expect(s3.getUrl('a.png')).toBe('http://localhost:9000/bucket/a.png');
    });
  });

  describe('upload', () => {
    it('deve enviar o objeto com cache padrão e sem ACL', async () => {
      const content = Buffer.from('data');

      const url = await service.upload('a.png', content, {
        contentType: 'image/png',
        metadata: { owner: 'u1' },
      });

      expect(url).toBe('https://bucket.s3.us-east-1.amazonaws.com/a.png');
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Key: 'a.png',
        Body: content,
        ContentType: 'image/png',
        Metadata: { owner: 'u1' },
        CacheControl: 'max-age=31536000',
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
      expect(mockedLogger.debug).toHaveBeenCalledWith('Arquivo enviado para S3', {
        bucket: 'bucket',
        key: 'a.png',
        size: content.length,
      });
    });

    it('deve enviar ACL e cacheControl quando informados', async () => {
      await service.upload('a.png', Buffer.from('x'), {
        contentType: 'image/png',
        acl: 'public-read',
        cacheControl: 'no-cache',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ACL: 'public-read', CacheControl: 'no-cache' })
      );
    });

    it('deve logar e lançar StorageUploadError quando o envio falha', async () => {
      const error = new Error('network');
      mockSend.mockRejectedValue(error);

      await expect(
        service.upload('a.png', Buffer.from('x'), { contentType: 'image/png' })
      ).rejects.toBeInstanceOf(StorageUploadError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao enviar para S3', error, {
        bucket: 'bucket',
        key: 'a.png',
      });
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockSend.mockRejectedValue('raw');

      await expect(
        service.upload('a.png', Buffer.from('x'), { contentType: 'image/png' })
      ).rejects.toBeInstanceOf(StorageUploadError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao enviar para S3', new Error('raw'), {
        bucket: 'bucket',
        key: 'a.png',
      });
    });
  });

  describe('get', () => {
    it('deve baixar e concatenar o stream (chunks Buffer e não-Buffer)', async () => {
      mockSend.mockResolvedValue({
        Body: Readable.from([Buffer.from('ab'), new Uint8Array([99, 100])]),
        ContentType: 'image/png',
        ContentLength: 4,
        Metadata: { owner: 'u1' },
      });

      const result = await service.get('a.png');

      expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'bucket', Key: 'a.png' });
      expect(result).toEqual({
        key: 'a.png',
        content: Buffer.from('abcd'),
        contentType: 'image/png',
        size: 4,
        metadata: { owner: 'u1' },
      });
    });

    it('deve usar valores padrão quando ContentType e ContentLength não vêm', async () => {
      mockSend.mockResolvedValue({ Body: Readable.from([Buffer.from('xyz')]) });

      const result = await service.get('a.png');

      expect(result.contentType).toBe('application/octet-stream');
      expect(result.size).toBe(3);
      expect(result.metadata).toBeUndefined();
    });

    it('deve enviar Range quando informado', async () => {
      mockSend.mockResolvedValue({ Body: Readable.from([Buffer.from('x')]) });

      await service.get('a.png', { range: 'bytes=0-9' });

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Key: 'a.png',
        Range: 'bytes=0-9',
      });
    });

    it('deve ignorar Range vazio', async () => {
      mockSend.mockResolvedValue({ Body: Readable.from([Buffer.from('x')]) });

      await service.get('a.png', { range: '' });

      expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'bucket', Key: 'a.png' });
    });

    it('deve lançar StorageFileNotFoundError quando o S3 retorna NoSuchKey', async () => {
      mockSend.mockRejectedValue(namedError('NoSuchKey'));

      await expect(service.get('a.png')).rejects.toThrow(new StorageFileNotFoundError('a.png'));
      expect(mockedLogger.error).not.toHaveBeenCalled();
    });

    it('deve lançar StorageDownloadError quando a resposta não tem Body', async () => {
      // Comportamento atual: o StorageFileNotFoundError lançado no try é capturado
      // pelo catch (name !== 'NoSuchKey') e vira StorageDownloadError.
      mockSend.mockResolvedValue({});

      await expect(service.get('a.png')).rejects.toBeInstanceOf(StorageDownloadError);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Erro ao baixar do S3',
        expect.any(StorageFileNotFoundError),
        { bucket: 'bucket', key: 'a.png' }
      );
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockSend.mockRejectedValue('raw');

      await expect(service.get('a.png')).rejects.toBeInstanceOf(StorageDownloadError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao baixar do S3', new Error('raw'), {
        bucket: 'bucket',
        key: 'a.png',
      });
    });
  });

  describe('delete', () => {
    it('deve deletar o objeto', async () => {
      await service.delete('a.png');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({ Bucket: 'bucket', Key: 'a.png' });
      expect(mockedLogger.debug).toHaveBeenCalledWith('Arquivo deletado do S3', {
        bucket: 'bucket',
        key: 'a.png',
      });
    });

    it('deve logar e lançar StorageDeleteError quando falha', async () => {
      const error = new Error('denied');
      mockSend.mockRejectedValue(error);

      await expect(service.delete('a.png')).rejects.toBeInstanceOf(StorageDeleteError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao deletar do S3', error, {
        bucket: 'bucket',
        key: 'a.png',
      });
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockSend.mockRejectedValue('raw');

      await expect(service.delete('a.png')).rejects.toBeInstanceOf(StorageDeleteError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao deletar do S3', new Error('raw'), {
        bucket: 'bucket',
        key: 'a.png',
      });
    });
  });

  describe('exists', () => {
    it('deve retornar true quando HeadObject tem sucesso', async () => {
      mockSend.mockResolvedValue({});

      await expect(service.exists('a.png')).resolves.toBe(true);
      expect(HeadObjectCommand).toHaveBeenCalledWith({ Bucket: 'bucket', Key: 'a.png' });
    });

    it('deve retornar false quando HeadObject falha', async () => {
      mockSend.mockRejectedValue(namedError('NotFound'));

      await expect(service.exists('a.png')).resolves.toBe(false);
    });
  });

  describe('copy', () => {
    it('deve copiar o objeto dentro do bucket', async () => {
      const url = await service.copy('a.png', 'b.png');

      expect(url).toBe('https://bucket.s3.us-east-1.amazonaws.com/b.png');
      expect(CopyObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket',
        CopySource: 'bucket/a.png',
        Key: 'b.png',
      });
    });

    it('deve lançar StorageFileNotFoundError quando a origem não existe', async () => {
      mockSend.mockRejectedValue(namedError('NoSuchKey'));

      await expect(service.copy('a.png', 'b.png')).rejects.toThrow(
        new StorageFileNotFoundError('a.png')
      );
    });

    it('deve logar e lançar StorageUploadError para outros erros', async () => {
      const error = new Error('denied');
      mockSend.mockRejectedValue(error);

      await expect(service.copy('a.png', 'b.png')).rejects.toThrow(
        new StorageUploadError('Falha ao copiar arquivo')
      );
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao copiar no S3', error, {
        sourceKey: 'a.png',
        destinationKey: 'b.png',
      });
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockSend.mockRejectedValue('raw');

      await expect(service.copy('a.png', 'b.png')).rejects.toBeInstanceOf(StorageUploadError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao copiar no S3', new Error('raw'), {
        sourceKey: 'a.png',
        destinationKey: 'b.png',
      });
    });
  });

  describe('move', () => {
    it('deve copiar e depois deletar a origem', async () => {
      const url = await service.move('a.png', 'b.png');

      expect(url).toBe('https://bucket.s3.us-east-1.amazonaws.com/b.png');
      expect(CopyObjectCommand).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith({ Bucket: 'bucket', Key: 'a.png' });
    });
  });

  describe('list', () => {
    it('deve mapear o resultado do ListObjectsV2', async () => {
      const lastModified = new Date('2024-01-01T00:00:00Z');
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'a.png', Size: 10, LastModified: lastModified },
          { Key: 'b.png' },
          { Size: 5 },
        ],
        IsTruncated: true,
        NextContinuationToken: 'next',
      });

      const result = await service.list({ prefix: 'img/', maxKeys: 10, continuationToken: 'tok' });

      expect(ListObjectsV2Command).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Prefix: 'img/',
        MaxKeys: 10,
        ContinuationToken: 'tok',
      });
      expect(result).toEqual({
        files: [
          { key: 'a.png', size: 10, lastModified },
          { key: 'b.png', size: 0, lastModified: expect.any(Date) },
        ],
        hasMore: true,
        continuationToken: 'next',
      });
    });

    it('deve retornar lista vazia quando não há Contents', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.list();

      expect(ListObjectsV2Command).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Prefix: undefined,
        MaxKeys: undefined,
        ContinuationToken: undefined,
      });
      expect(result).toEqual({ files: [], hasMore: false, continuationToken: undefined });
    });

    it('deve logar e retornar lista vazia quando falha', async () => {
      const error = new Error('denied');
      mockSend.mockRejectedValue(error);

      await expect(service.list()).resolves.toEqual({ files: [], hasMore: false });
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao listar arquivos do S3', error);
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      mockSend.mockRejectedValue('raw');

      await expect(service.list()).resolves.toEqual({ files: [], hasMore: false });
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Erro ao listar arquivos do S3',
        new Error('raw')
      );
    });
  });

  describe('getSignedUrl', () => {
    it('deve gerar URL assinada com expiração padrão de 3600s', async () => {
      mockedGetSignedUrl.mockResolvedValue('https://signed');

      await expect(service.getSignedUrl('a.png')).resolves.toBe('https://signed');
      expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'bucket', Key: 'a.png' });
      expect(mockedGetSignedUrl).toHaveBeenCalledWith(
        { send: mockSend },
        expect.any(GetObjectCommand),
        { expiresIn: 3600 }
      );
    });

    it('deve respeitar a expiração informada', async () => {
      mockedGetSignedUrl.mockResolvedValue('https://signed');

      await service.getSignedUrl('a.png', 60);

      expect(mockedGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 60,
      });
    });
  });
});
