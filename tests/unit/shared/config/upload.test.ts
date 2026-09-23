import path from 'path';

// Impede que o .env local (gitignored) injete AWS_S3_ENDPOINT, AWS_REGION etc.
// e torne os testes dependentes da máquina.
jest.mock('dotenv/config', () => ({}));

type UploadModule = typeof import('@/shared/config/upload');

const originalEnv = process.env;

const UPLOAD_ENV_KEYS = [
  'STORAGE_PROVIDER',
  'UPLOAD_PATH',
  'UPLOAD_BASE_URL',
  'AWS_S3_BUCKET',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_ENDPOINT',
  'AWS_S3_FORCE_PATH_STYLE',
  'MAX_FILE_SIZE',
  'MAX_AVATAR_SIZE',
  'MAX_IMAGE_SIZE',
  'MAX_DOCUMENT_SIZE',
  'AVATAR_QUALITY',
  'AVATAR_FORMAT',
  'IMAGE_MAX_WIDTH',
  'IMAGE_MAX_HEIGHT',
  'IMAGE_QUALITY',
  'IMAGE_FORMAT',
] as const;

const loadUploadConfig = (env: Record<string, string> = {}): UploadModule => {
  const cleanEnv: NodeJS.ProcessEnv = { ...originalEnv };
  for (const key of UPLOAD_ENV_KEYS) {
    delete cleanEnv[key];
  }
  process.env = { ...cleanEnv, ...env };

  let mod: UploadModule | undefined;
  jest.isolateModules(() => {
    mod = require('@/shared/config/upload') as UploadModule;
  });
  return mod as UploadModule;
};

describe('upload config', () => {
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('valores padrão', () => {
    it('deve usar os valores padrão quando nenhuma variável de ambiente está definida', () => {
      const { uploadConfig } = loadUploadConfig();

      expect(uploadConfig.storage.provider).toBe('local');
      expect(uploadConfig.storage.local.basePath).toBe(path.join(process.cwd(), 'uploads'));
      expect(uploadConfig.storage.local.baseUrl).toBe('/uploads');
      expect(uploadConfig.storage.s3).toEqual({
        bucket: '',
        region: 'us-east-1',
        accessKeyId: '',
        secretAccessKey: '',
        endpoint: undefined,
        forcePathStyle: false,
      });
      expect(uploadConfig.limits).toEqual({
        maxFileSize: 50 * 1024 * 1024,
        maxAvatarSize: 5 * 1024 * 1024,
        maxImageSize: 10 * 1024 * 1024,
        maxDocumentSize: 25 * 1024 * 1024,
      });
      expect(uploadConfig.avatar.quality).toBe(85);
      expect(uploadConfig.avatar.format).toBe('webp');
      expect(uploadConfig.avatar.sizes.map((s) => s.name)).toEqual([
        'original',
        'large',
        'medium',
        'small',
        'thumbnail',
      ]);
      expect(uploadConfig.image).toEqual({
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 85,
        format: 'webp',
      });
      expect(uploadConfig.paths).toEqual({
        avatars: 'avatars',
        images: 'images',
        documents: 'documents',
        temp: 'temp',
      });
    });

    it('deve tratar strings vazias como ausentes em variáveis numéricas, booleanas e endpoint', () => {
      const { uploadConfig } = loadUploadConfig({
        MAX_FILE_SIZE: '',
        AWS_S3_FORCE_PATH_STYLE: '',
        AWS_S3_ENDPOINT: '',
      });

      expect(uploadConfig.limits.maxFileSize).toBe(50 * 1024 * 1024);
      expect(uploadConfig.storage.s3.forcePathStyle).toBe(false);
      expect(uploadConfig.storage.s3.endpoint).toBeUndefined();
    });

    it('deve usar o valor padrão quando a variável numérica não é um número', () => {
      const { uploadConfig } = loadUploadConfig({ MAX_AVATAR_SIZE: 'abc' });

      expect(uploadConfig.limits.maxAvatarSize).toBe(5 * 1024 * 1024);
    });
  });

  describe('variáveis de ambiente', () => {
    it('deve ler todas as variáveis de ambiente definidas', () => {
      const { uploadConfig } = loadUploadConfig({
        STORAGE_PROVIDER: 's3',
        UPLOAD_PATH: '/var/uploads',
        UPLOAD_BASE_URL: 'https://cdn.example.com',
        AWS_S3_BUCKET: 'my-bucket',
        AWS_REGION: 'sa-east-1',
        AWS_ACCESS_KEY_ID: 'key',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_S3_ENDPOINT: 'http://localhost:9000',
        AWS_S3_FORCE_PATH_STYLE: 'TRUE',
        MAX_FILE_SIZE: '1000',
        MAX_AVATAR_SIZE: '2000',
        MAX_IMAGE_SIZE: '3000',
        MAX_DOCUMENT_SIZE: '4000',
        AVATAR_QUALITY: '70',
        AVATAR_FORMAT: 'png',
        IMAGE_MAX_WIDTH: '1024',
        IMAGE_MAX_HEIGHT: '768',
        IMAGE_QUALITY: '60',
        IMAGE_FORMAT: 'jpeg',
      });

      expect(uploadConfig.storage).toEqual({
        provider: 's3',
        local: { basePath: '/var/uploads', baseUrl: 'https://cdn.example.com' },
        s3: {
          bucket: 'my-bucket',
          region: 'sa-east-1',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          endpoint: 'http://localhost:9000',
          forcePathStyle: true,
        },
      });
      expect(uploadConfig.limits).toEqual({
        maxFileSize: 1000,
        maxAvatarSize: 2000,
        maxImageSize: 3000,
        maxDocumentSize: 4000,
      });
      expect(uploadConfig.avatar.quality).toBe(70);
      expect(uploadConfig.avatar.format).toBe('png');
      expect(uploadConfig.image).toEqual({
        maxWidth: 1024,
        maxHeight: 768,
        quality: 60,
        format: 'jpeg',
      });
    });

    it('deve interpretar AWS_S3_FORCE_PATH_STYLE diferente de "true" como false', () => {
      const { uploadConfig } = loadUploadConfig({ AWS_S3_FORCE_PATH_STYLE: 'yes' });

      expect(uploadConfig.storage.s3.forcePathStyle).toBe(false);
    });
  });

  describe('constantes', () => {
    it('deve exportar os formatos suportados', () => {
      const { SUPPORTED_IMAGE_FORMATS, SUPPORTED_DOCUMENT_FORMATS } = loadUploadConfig();

      expect(SUPPORTED_IMAGE_FORMATS).toEqual(['jpeg', 'jpg', 'png', 'webp', 'gif']);
      expect(SUPPORTED_DOCUMENT_FORMATS).toEqual([
        'pdf',
        'doc',
        'docx',
        'xls',
        'xlsx',
        'txt',
        'csv',
      ]);
    });
  });

  describe('helpers de caminho', () => {
    it('deve montar os caminhos de upload', () => {
      const { getAvatarPath, getImagePath, getDocumentPath, getTempPath } = loadUploadConfig();

      expect(getAvatarPath('small')).toBe(path.join('avatars', 'small'));
      expect(getImagePath()).toBe('images');
      expect(getDocumentPath()).toBe('documents');
      expect(getTempPath()).toBe('temp');
    });
  });

  describe('isValidMimeType', () => {
    it.each([
      ['image/png', 'avatar', true],
      ['image/svg+xml', 'avatar', false],
      ['image/svg+xml', 'image', true],
      ['application/pdf', 'document', true],
      ['application/zip', 'document', false],
    ] as const)('deve retornar %s em %s => %s', (mimeType, category, expected) => {
      const { isValidMimeType } = loadUploadConfig();

      expect(isValidMimeType(mimeType, category)).toBe(expected);
    });
  });

  describe('getMaxFileSize', () => {
    it('deve retornar o limite de cada categoria', () => {
      const { getMaxFileSize } = loadUploadConfig();

      expect(getMaxFileSize('avatar')).toBe(5 * 1024 * 1024);
      expect(getMaxFileSize('image')).toBe(10 * 1024 * 1024);
      expect(getMaxFileSize('document')).toBe(25 * 1024 * 1024);
    });

    it('deve retornar o limite geral para uma categoria desconhecida', () => {
      const { getMaxFileSize } = loadUploadConfig();

      expect(getMaxFileSize('video' as unknown as 'avatar')).toBe(50 * 1024 * 1024);
    });
  });
});
