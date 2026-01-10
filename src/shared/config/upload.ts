import 'dotenv/config';
import path from 'path';

export interface ImageSize {
  name: string;
  width: number;
  height: number;
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface UploadConfig {
  storage: {
    provider: 'local' | 's3';
    local: {
      basePath: string;
      baseUrl: string;
    };
    s3: {
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      endpoint?: string;
      forcePathStyle?: boolean;
    };
  };
  limits: {
    maxFileSize: number;
    maxAvatarSize: number;
    maxImageSize: number;
    maxDocumentSize: number;
  };
  allowedMimeTypes: {
    avatar: string[];
    image: string[];
    document: string[];
  };
  avatar: {
    sizes: ImageSize[];
    quality: number;
    format: 'webp' | 'jpeg' | 'png';
  };
  image: {
    maxWidth: number;
    maxHeight: number;
    quality: number;
    format: 'webp' | 'jpeg' | 'png';
  };
  paths: {
    avatars: string;
    images: string;
    documents: string;
    temp: string;
  };
}

const getEnv = (key: string, defaultValue = ''): string => {
  return process.env[key] ?? defaultValue;
};

const getNumericEnv = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
};

const getBooleanEnv = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
};

export const uploadConfig: UploadConfig = {
  storage: {
    provider: getEnv('STORAGE_PROVIDER', 'local') as 'local' | 's3',
    local: {
      basePath: getEnv('UPLOAD_PATH', path.join(process.cwd(), 'uploads')),
      baseUrl: getEnv('UPLOAD_BASE_URL', '/uploads'),
    },
    s3: {
      bucket: getEnv('AWS_S3_BUCKET', ''),
      region: getEnv('AWS_REGION', 'us-east-1'),
      accessKeyId: getEnv('AWS_ACCESS_KEY_ID', ''),
      secretAccessKey: getEnv('AWS_SECRET_ACCESS_KEY', ''),
      endpoint: getEnv('AWS_S3_ENDPOINT') || undefined,
      forcePathStyle: getBooleanEnv('AWS_S3_FORCE_PATH_STYLE', false),
    },
  },

  limits: {
    maxFileSize: getNumericEnv('MAX_FILE_SIZE', 50 * 1024 * 1024),
    maxAvatarSize: getNumericEnv('MAX_AVATAR_SIZE', 5 * 1024 * 1024),
    maxImageSize: getNumericEnv('MAX_IMAGE_SIZE', 10 * 1024 * 1024),
    maxDocumentSize: getNumericEnv('MAX_DOCUMENT_SIZE', 25 * 1024 * 1024),
  },

  allowedMimeTypes: {
    avatar: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
    document: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ],
  },

  avatar: {
    sizes: [
      { name: 'original', width: 1024, height: 1024, fit: 'inside' },
      { name: 'large', width: 512, height: 512, fit: 'cover' },
      { name: 'medium', width: 256, height: 256, fit: 'cover' },
      { name: 'small', width: 128, height: 128, fit: 'cover' },
      { name: 'thumbnail', width: 64, height: 64, fit: 'cover' },
    ],
    quality: getNumericEnv('AVATAR_QUALITY', 85),
    format: getEnv('AVATAR_FORMAT', 'webp') as 'webp' | 'jpeg' | 'png',
  },

  image: {
    maxWidth: getNumericEnv('IMAGE_MAX_WIDTH', 2048),
    maxHeight: getNumericEnv('IMAGE_MAX_HEIGHT', 2048),
    quality: getNumericEnv('IMAGE_QUALITY', 85),
    format: getEnv('IMAGE_FORMAT', 'webp') as 'webp' | 'jpeg' | 'png',
  },

  paths: {
    avatars: 'avatars',
    images: 'images',
    documents: 'documents',
    temp: 'temp',
  },
};

export const SUPPORTED_IMAGE_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif'] as const;
export const SUPPORTED_DOCUMENT_FORMATS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'txt',
  'csv',
] as const;

export const getAvatarPath = (size: string): string => {
  return path.join(uploadConfig.paths.avatars, size);
};

export const getImagePath = (): string => {
  return uploadConfig.paths.images;
};

export const getDocumentPath = (): string => {
  return uploadConfig.paths.documents;
};

export const getTempPath = (): string => {
  return uploadConfig.paths.temp;
};

export const isValidMimeType = (
  mimeType: string,
  category: 'avatar' | 'image' | 'document'
): boolean => {
  return uploadConfig.allowedMimeTypes[category].includes(mimeType);
};

export const getMaxFileSize = (category: 'avatar' | 'image' | 'document'): number => {
  switch (category) {
    case 'avatar':
      return uploadConfig.limits.maxAvatarSize;
    case 'image':
      return uploadConfig.limits.maxImageSize;
    case 'document':
      return uploadConfig.limits.maxDocumentSize;
    default:
      return uploadConfig.limits.maxFileSize;
  }
};
