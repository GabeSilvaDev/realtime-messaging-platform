jest.mock('@/shared/logger', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/shared/services/StorageService', () => {
  const actual = jest.requireActual('@/shared/services/StorageService');
  return {
    ...actual,
    storageService: {
      upload: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      getUrl: jest.fn(),
      move: jest.fn(),
      copy: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      getSignedUrl: jest.fn(),
    },
  };
});

import {
  FileService,
  FileTooLargeError,
  InvalidFileTypeError,
  FileNotFoundError,
  FileUploadError,
  type UploadedFile,
} from '@/shared/services/FileService';
import {
  StorageFileNotFoundError,
  storageService,
  type IStorageService,
} from '@/shared/services/StorageService';
import { logger } from '@/shared/logger';
import { uploadConfig, getTempPath } from '@/shared/config/upload';

type MockStorage = {
  upload: jest.Mock;
  delete: jest.Mock;
  exists: jest.Mock;
  getUrl: jest.Mock;
  move: jest.Mock;
  copy: jest.Mock;
  list: jest.Mock;
};

const mockStorage = storageService as unknown as MockStorage;

const buildFile = (overrides: Partial<UploadedFile> = {}): UploadedFile => ({
  fieldname: 'file',
  originalname: 'photo.png',
  encoding: '7bit',
  mimetype: 'image/png',
  buffer: Buffer.from('conteudo'),
  size: 1024,
  ...overrides,
});

describe('FileService', () => {
  let fileService: FileService;

  beforeEach(() => {
    mockStorage.upload.mockResolvedValue('http://storage/local/file');
    mockStorage.delete.mockResolvedValue(undefined);
    mockStorage.exists.mockResolvedValue(true);
    mockStorage.getUrl.mockReturnValue('http://storage/local/file');
    mockStorage.move.mockResolvedValue('http://storage/local/moved');
    mockStorage.copy.mockResolvedValue('http://storage/local/copied');
    mockStorage.list.mockResolvedValue({ files: [], hasMore: false });
    fileService = new FileService(mockStorage as unknown as IStorageService);
  });

  describe('upload', () => {
    it('gera nome único por padrão e envia o arquivo com sucesso', async () => {
      const file = buildFile();

      const result = await fileService.upload(file);

      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      const [filePath, buffer, options] = mockStorage.upload.mock.calls[0];
      expect(buffer).toBe(file.buffer);
      expect(options.contentType).toBe('image/png');
      expect(options.metadata.originalName).toBe('photo.png');
      expect(result.filename).toBe(filePath);
      expect(result.originalName).toBe('photo.png');
      expect(result.mimeType).toBe('image/png');
      expect(result.size).toBe(1024);
      expect(result.url).toBe('http://storage/local/file');
      expect(result.path).toBe(filePath);
      expect(result.uploadedAt).toBeInstanceOf(Date);
      expect(logger.info).toHaveBeenCalledWith(
        'Arquivo enviado com sucesso',
        expect.objectContaining({ filename: filePath })
      );
    });

    it('usa diretório quando informado, compondo o path final', async () => {
      const file = buildFile();

      const result = await fileService.upload(file, { directory: 'avatars' });

      expect(result.path.startsWith('avatars')).toBe(true);
    });

    it('preserva o nome original quando preserveOriginalName é true', async () => {
      const file = buildFile({ originalname: 'meu arquivo!.png' });

      const result = await fileService.upload(file, {
        preserveOriginalName: true,
        generateUniqueName: false,
      });

      expect(result.filename).toBe('meu-arquivo.png');
    });

    it('sanitiza o nome quando generateUniqueName e preserveOriginalName são false', async () => {
      const file = buildFile({ originalname: 'outro arquivo!!.png' });

      const result = await fileService.upload(file, {
        generateUniqueName: false,
        preserveOriginalName: false,
      });

      expect(result.filename).toBe('outro-arquivo.png');
    });

    it('lança FileTooLargeError quando o arquivo excede o tamanho máximo padrão', async () => {
      const file = buildFile({ size: uploadConfig.limits.maxFileSize + 1 });

      await expect(fileService.upload(file)).rejects.toBeInstanceOf(FileTooLargeError);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('lança FileTooLargeError usando maxSize customizado', async () => {
      const file = buildFile({ size: 200 });

      await expect(fileService.upload(file, { maxSize: 100 })).rejects.toBeInstanceOf(
        FileTooLargeError
      );
    });

    it('lança InvalidFileTypeError quando o mimetype não está na allowlist', async () => {
      const file = buildFile({ mimetype: 'application/x-msdownload' });

      await expect(
        fileService.upload(file, { allowedMimeTypes: ['image/png', 'image/jpeg'] })
      ).rejects.toBeInstanceOf(InvalidFileTypeError);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('aceita o arquivo quando o mimetype está na allowlist', async () => {
      const file = buildFile({ mimetype: 'image/png' });

      const result = await fileService.upload(file, { allowedMimeTypes: ['image/png'] });

      expect(result).toBeDefined();
    });

    it('loga o erro e lança FileUploadError quando o storage falha', async () => {
      mockStorage.upload.mockRejectedValueOnce(new Error('disco cheio'));
      const file = buildFile();

      await expect(fileService.upload(file)).rejects.toBeInstanceOf(FileUploadError);
      expect(logger.error).toHaveBeenCalledWith(
        'Erro ao fazer upload do arquivo',
        expect.any(Error),
        expect.objectContaining({ filename: expect.any(String) })
      );
    });

    it('loga o erro com Error genérico quando o storage rejeita com valor não-Error', async () => {
      mockStorage.upload.mockRejectedValueOnce('falha crua');
      const file = buildFile();

      await expect(fileService.upload(file)).rejects.toBeInstanceOf(FileUploadError);
      expect(logger.error).toHaveBeenCalledWith(
        'Erro ao fazer upload do arquivo',
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('uploadMultiple', () => {
    it('envia múltiplos arquivos sequencialmente e retorna todos os resultados', async () => {
      const files = [buildFile({ originalname: 'a.png' }), buildFile({ originalname: 'b.png' })];

      const results = await fileService.uploadMultiple(files);

      expect(results).toHaveLength(2);
      expect(mockStorage.upload).toHaveBeenCalledTimes(2);
    });

    it('retorna array vazio quando não há arquivos', async () => {
      const results = await fileService.uploadMultiple([]);
      expect(results).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deleta com sucesso e loga info', async () => {
      await fileService.delete('avatars/foo.png');

      expect(mockStorage.delete).toHaveBeenCalledWith('avatars/foo.png');
      expect(logger.info).toHaveBeenCalledWith('Arquivo deletado com sucesso', {
        filePath: 'avatars/foo.png',
      });
    });

    it('lança FileNotFoundError quando o storage não encontra o arquivo', async () => {
      mockStorage.delete.mockRejectedValueOnce(new StorageFileNotFoundError('x'));

      await expect(fileService.delete('x')).rejects.toBeInstanceOf(FileNotFoundError);
    });

    it('loga e repropaga erro genérico do storage', async () => {
      const boom = new Error('falha ao deletar');
      mockStorage.delete.mockRejectedValueOnce(boom);

      await expect(fileService.delete('x')).rejects.toBe(boom);
      expect(logger.error).toHaveBeenCalledWith(
        'Erro ao deletar arquivo',
        boom,
        expect.objectContaining({ filePath: 'x' })
      );
    });

    it('loga com Error genérico quando o erro não-Error é lançado', async () => {
      mockStorage.delete.mockRejectedValueOnce('erro cru');

      await expect(fileService.delete('x')).rejects.toBe('erro cru');
      expect(logger.error).toHaveBeenCalledWith(
        'Erro ao deletar arquivo',
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('deleteMultiple', () => {
    it('deleta todos os arquivos sem erros', async () => {
      await fileService.deleteMultiple(['a', 'b']);
      expect(mockStorage.delete).toHaveBeenCalledTimes(2);
    });

    it('ignora falhas parciais (loga warn) sem lançar', async () => {
      mockStorage.delete.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('falha'));

      await expect(fileService.deleteMultiple(['a', 'b'])).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Falha ao deletar arquivo',
        expect.objectContaining({ filePath: 'b' })
      );
    });

    it('lança FileUploadError quando todas as deleções falham', async () => {
      mockStorage.delete.mockRejectedValue(new Error('falha'));

      await expect(fileService.deleteMultiple(['a', 'b'])).rejects.toBeInstanceOf(FileUploadError);
    });

    it('não lança quando a lista está vazia', async () => {
      await expect(fileService.deleteMultiple([])).resolves.toBeUndefined();
    });
  });

  describe('exists', () => {
    it('delega para o storage e retorna true', async () => {
      mockStorage.exists.mockResolvedValueOnce(true);
      await expect(fileService.exists('a')).resolves.toBe(true);
    });

    it('delega para o storage e retorna false', async () => {
      mockStorage.exists.mockResolvedValueOnce(false);
      await expect(fileService.exists('a')).resolves.toBe(false);
    });
  });

  describe('getUrl', () => {
    it('delega para o storage', () => {
      mockStorage.getUrl.mockReturnValueOnce('http://x');
      expect(fileService.getUrl('a')).toBe('http://x');
      expect(mockStorage.getUrl).toHaveBeenCalledWith('a');
    });
  });

  describe('move', () => {
    it('move com sucesso e retorna o resultado', async () => {
      const result = await fileService.move('temp/a.png', 'avatars/a.png');

      expect(mockStorage.move).toHaveBeenCalledWith('temp/a.png', 'avatars/a.png');
      expect(result.filename).toBe('a.png');
      expect(result.path).toBe('avatars/a.png');
      expect(result.url).toBe('http://storage/local/moved');
      expect(result.mimeType).toBe('application/octet-stream');
      expect(result.size).toBe(0);
    });

    it('lança FileNotFoundError quando a origem não existe', async () => {
      mockStorage.move.mockRejectedValueOnce(new StorageFileNotFoundError('x'));

      await expect(fileService.move('a', 'b')).rejects.toBeInstanceOf(FileNotFoundError);
    });

    it('repropaga erro genérico do storage', async () => {
      const boom = new Error('falha ao mover');
      mockStorage.move.mockRejectedValueOnce(boom);

      await expect(fileService.move('a', 'b')).rejects.toBe(boom);
    });
  });

  describe('copy', () => {
    it('copia com sucesso e retorna o resultado', async () => {
      const result = await fileService.copy('temp/a.png', 'avatars/a.png');

      expect(mockStorage.copy).toHaveBeenCalledWith('temp/a.png', 'avatars/a.png');
      expect(result.filename).toBe('a.png');
      expect(result.path).toBe('avatars/a.png');
      expect(result.url).toBe('http://storage/local/copied');
    });

    it('lança FileNotFoundError quando a origem não existe', async () => {
      mockStorage.copy.mockRejectedValueOnce(new StorageFileNotFoundError('x'));

      await expect(fileService.copy('a', 'b')).rejects.toBeInstanceOf(FileNotFoundError);
    });

    it('repropaga erro genérico do storage', async () => {
      const boom = new Error('falha ao copiar');
      mockStorage.copy.mockRejectedValueOnce(boom);

      await expect(fileService.copy('a', 'b')).rejects.toBe(boom);
    });
  });

  describe('validateFile', () => {
    it('não lança quando avatar é válido', () => {
      const file = buildFile({ mimetype: 'image/png', size: 1024 });
      expect(() => fileService.validateFile(file, 'avatar')).not.toThrow();
    });

    it('lança FileTooLargeError quando excede o limite da categoria', () => {
      const file = buildFile({ size: uploadConfig.limits.maxAvatarSize + 1 });
      expect(() => fileService.validateFile(file, 'avatar')).toThrow(FileTooLargeError);
    });

    it('lança InvalidFileTypeError quando o mimetype não é permitido para a categoria', () => {
      const file = buildFile({ mimetype: 'application/zip', size: 10 });
      expect(() => fileService.validateFile(file, 'document')).toThrow(InvalidFileTypeError);
    });

    it('valida a categoria image corretamente', () => {
      const file = buildFile({ mimetype: 'image/webp', size: 10 });
      expect(() => fileService.validateFile(file, 'image')).not.toThrow();
    });
  });

  describe('generateUniqueFilename', () => {
    it('gera nome com timestamp, hex aleatório e extensão original', () => {
      const name = fileService.generateUniqueFilename('Foto Grande.PNG');
      expect(name).toMatch(/^\d+-[0-9a-f]{16}\.png$/);
    });
  });

  describe('sanitizeFilename', () => {
    it('troca espaços por hífen e remove caracteres inválidos', () => {
      expect(fileService.sanitizeFilename('meu arquivo (1)!!.png')).toBe('meu-arquivo-1.png');
    });

    it('trunca nomes muito longos preservando a extensão', () => {
      const longName = `${'a'.repeat(150)}.png`;
      const sanitized = fileService.sanitizeFilename(longName);
      expect(sanitized.endsWith('.png')).toBe(true);
      expect(sanitized.length).toBe(104);
    });
  });

  describe('uploadToTemp', () => {
    it('envia para o diretório temporário com nome único', async () => {
      const file = buildFile();

      const result = await fileService.uploadToTemp(file);

      expect(result.path.startsWith(getTempPath())).toBe(true);
    });
  });

  describe('moveFromTemp', () => {
    it('delega para move', async () => {
      const result = await fileService.moveFromTemp('temp/a.png', 'avatars/a.png');
      expect(mockStorage.move).toHaveBeenCalledWith('temp/a.png', 'avatars/a.png');
      expect(result.path).toBe('avatars/a.png');
    });
  });

  describe('cleanupTemp', () => {
    it('deleta apenas arquivos mais antigos que o cutoff e retorna a contagem', async () => {
      const now = Date.now();
      mockStorage.list.mockResolvedValueOnce({
        files: [
          { key: 'temp/old.png', size: 1, lastModified: new Date(now - 48 * 60 * 60 * 1000) },
          { key: 'temp/new.png', size: 1, lastModified: new Date(now) },
        ],
        hasMore: false,
      });

      const deletedCount = await fileService.cleanupTemp(24);

      expect(deletedCount).toBe(1);
      expect(mockStorage.delete).toHaveBeenCalledWith('temp/old.png');
      expect(mockStorage.delete).not.toHaveBeenCalledWith('temp/new.png');
      expect(logger.info).toHaveBeenCalledWith('Limpeza de arquivos temporários concluída', {
        deletedCount: 1,
      });
    });

    it('usa 24 horas como padrão quando nenhum valor é informado', async () => {
      mockStorage.list.mockResolvedValueOnce({ files: [], hasMore: false });

      const deletedCount = await fileService.cleanupTemp();

      expect(deletedCount).toBe(0);
    });

    it('ignora falha ao deletar um arquivo específico e continua a limpeza', async () => {
      mockStorage.list.mockResolvedValueOnce({
        files: [
          { key: 'temp/a.png', size: 1, lastModified: new Date(0) },
          { key: 'temp/b.png', size: 1, lastModified: new Date(0) },
        ],
        hasMore: false,
      });
      mockStorage.delete
        .mockRejectedValueOnce(new Error('falha ao deletar a'))
        .mockResolvedValueOnce(undefined);

      const deletedCount = await fileService.cleanupTemp(1);

      expect(deletedCount).toBe(1);
    });

    it('loga erro e retorna 0 quando storage.list falha com um Error', async () => {
      mockStorage.list.mockRejectedValueOnce(new Error('storage indisponível'));

      const deletedCount = await fileService.cleanupTemp();

      expect(deletedCount).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Erro ao limpar arquivos temporários',
        expect.any(Error)
      );
    });

    it('loga erro com Error genérico quando storage.list rejeita com valor não-Error', async () => {
      mockStorage.list.mockRejectedValueOnce('falha crua');

      const deletedCount = await fileService.cleanupTemp();

      expect(deletedCount).toBe(0);
      const [, loggedError] = (logger.error as jest.Mock).mock.calls[0];
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError.message).toBe('falha crua');
    });
  });

  describe('fileService (instância padrão exportada)', () => {
    it('usa o storageService padrão quando nenhum é injetado', () => {
      const { fileService: defaultInstance } = require('@/shared/services/FileService');
      expect(defaultInstance).toBeInstanceOf(FileService);
    });
  });
});
