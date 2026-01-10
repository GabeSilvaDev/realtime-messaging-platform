import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import type { Request } from 'express';
import { uploadConfig } from '@/shared/config/upload';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

export class FileUploadError extends AppError {
  constructor(message = 'Erro no upload do arquivo') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class FileSizeLimitError extends AppError {
  constructor(maxSizeMB: number) {
    super(
      `Arquivo muito grande. Tamanho máximo: ${String(maxSizeMB)}MB`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class InvalidFileTypeError extends AppError {
  constructor(allowedTypes: string[]) {
    super(
      `Tipo de arquivo não permitido. Tipos aceitos: ${allowedTypes.join(', ')}`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

const memoryStorage = multer.memoryStorage();

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadConfig.paths.temp);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}-${random}${ext}`);
  },
});

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedMimes = uploadConfig.allowedMimeTypes.image;
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new InvalidFileTypeError(['JPEG', 'PNG', 'WebP', 'GIF']));
  }
};

const avatarFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedMimes = uploadConfig.allowedMimeTypes.avatar;
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new InvalidFileTypeError(['JPEG', 'PNG', 'WebP', 'GIF']));
  }
};

const documentFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedMimes = uploadConfig.allowedMimeTypes.document;
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new InvalidFileTypeError(['PDF', 'DOC', 'DOCX', 'TXT', 'XLS', 'XLSX', 'CSV']));
  }
};

export const uploadAvatar = multer({
  storage: memoryStorage,
  limits: {
    fileSize: uploadConfig.limits.maxAvatarSize,
    files: 1,
  },
  fileFilter: avatarFileFilter,
});

export const uploadImage = multer({
  storage: memoryStorage,
  limits: {
    fileSize: uploadConfig.limits.maxImageSize,
    files: 1,
  },
  fileFilter: imageFileFilter,
});

export const uploadImages = multer({
  storage: memoryStorage,
  limits: {
    fileSize: uploadConfig.limits.maxImageSize,
    files: 10,
  },
  fileFilter: imageFileFilter,
});

export const uploadDocument = multer({
  storage: memoryStorage,
  limits: {
    fileSize: uploadConfig.limits.maxDocumentSize,
    files: 1,
  },
  fileFilter: documentFileFilter,
});

export const uploadToDisk = multer({
  storage: diskStorage,
  limits: {
    fileSize: uploadConfig.limits.maxDocumentSize,
    files: 5,
  },
});

export function handleMulterError(error: Error, maxSizeMB = 10): AppError {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return new FileSizeLimitError(maxSizeMB);
      case 'LIMIT_FILE_COUNT':
        return new FileUploadError('Número máximo de arquivos excedido');
      case 'LIMIT_UNEXPECTED_FILE':
        return new FileUploadError('Campo de arquivo inesperado');
      case 'LIMIT_PART_COUNT':
        return new FileUploadError('Número máximo de partes excedido');
      case 'LIMIT_FIELD_KEY':
        return new FileUploadError('Nome do campo muito longo');
      case 'LIMIT_FIELD_VALUE':
        return new FileUploadError('Valor do campo muito longo');
      case 'LIMIT_FIELD_COUNT':
        return new FileUploadError('Número máximo de campos excedido');
      default:
        return new FileUploadError(error.message);
    }
  }

  if (error instanceof AppError) {
    return error;
  }

  return new FileUploadError(error.message);
}

export function requireFile(fieldName = 'file') {
  return (req: Request, _res: unknown, next: (err?: unknown) => void): void => {
    const file = req.file;
    const files = req.files;

    const hasFile =
      file !== undefined ||
      (Array.isArray(files) && files.length > 0) ||
      (files !== undefined && typeof files === 'object' && fieldName in files);

    if (!hasFile) {
      next(new FileUploadError('Nenhum arquivo enviado'));
      return;
    }

    next();
  };
}
