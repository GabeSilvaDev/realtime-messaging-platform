import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import request from 'supertest';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { uploadConfig } from '@/shared/config/upload';
import {
  FileSizeLimitError,
  FileUploadError,
  InvalidFileTypeError,
  handleMulterError,
  requireFile,
  uploadAvatar,
  uploadDocument,
  uploadImage,
  uploadImages,
  uploadToDisk,
} from '@/shared/middlewares/upload';

type StorageCallback = (error: Error | null, value: string) => void;

interface DiskStorageInternals {
  getDestination: (req: Request, file: Express.Multer.File, cb: StorageCallback) => void;
  getFilename: (req: Request, file: Express.Multer.File, cb: StorageCallback) => void;
}

const buildApp = (middleware: express.RequestHandler): Application => {
  const app = express();
  app.post('/upload', middleware, (req: Request, res: Response) => {
    const files = Array.isArray(req.files) ? req.files : [];
    res.status(200).json({
      file: req.file?.originalname ?? null,
      files: files.map((f) => f.originalname),
    });
  });
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const appError = handleMulterError(err);
    res.status(appError.statusCode).json({ code: appError.code, message: appError.message });
  });
  return app;
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('upload middleware', () => {
  describe('classes de erro', () => {
    it('FileUploadError usa a mensagem padrão quando nenhuma é informada', () => {
      const error = new FileUploadError();

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Erro no upload do arquivo');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('FileUploadError aceita mensagem customizada', () => {
      expect(new FileUploadError('custom').message).toBe('custom');
    });

    it('FileSizeLimitError inclui o tamanho máximo em MB', () => {
      const error = new FileSizeLimitError(5);

      expect(error.message).toBe('Arquivo muito grande. Tamanho máximo: 5MB');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('InvalidFileTypeError lista os tipos aceitos', () => {
      const error = new InvalidFileTypeError(['PNG', 'JPEG']);

      expect(error.message).toBe('Tipo de arquivo não permitido. Tipos aceitos: PNG, JPEG');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('handleMulterError', () => {
    it('converte LIMIT_FILE_SIZE em FileSizeLimitError com o default de 10MB', () => {
      const result = handleMulterError(new multer.MulterError('LIMIT_FILE_SIZE'));

      expect(result).toBeInstanceOf(FileSizeLimitError);
      expect(result.message).toBe('Arquivo muito grande. Tamanho máximo: 10MB');
    });

    it('usa o maxSizeMB informado em LIMIT_FILE_SIZE', () => {
      const result = handleMulterError(new multer.MulterError('LIMIT_FILE_SIZE'), 5);

      expect(result.message).toBe('Arquivo muito grande. Tamanho máximo: 5MB');
    });

    it.each([
      ['LIMIT_FILE_COUNT', 'Número máximo de arquivos excedido'],
      ['LIMIT_UNEXPECTED_FILE', 'Campo de arquivo inesperado'],
      ['LIMIT_PART_COUNT', 'Número máximo de partes excedido'],
      ['LIMIT_FIELD_KEY', 'Nome do campo muito longo'],
      ['LIMIT_FIELD_VALUE', 'Valor do campo muito longo'],
      ['LIMIT_FIELD_COUNT', 'Número máximo de campos excedido'],
    ] as const)('converte %s em FileUploadError', (code, message) => {
      const result = handleMulterError(new multer.MulterError(code));

      expect(result).toBeInstanceOf(FileUploadError);
      expect(result.message).toBe(message);
    });

    it('usa a mensagem do MulterError para códigos não mapeados', () => {
      const multerError = new multer.MulterError('MISSING_FIELD_NAME' as multer.ErrorCode);

      const result = handleMulterError(multerError);

      expect(result).toBeInstanceOf(FileUploadError);
      expect(result.message).toBe(multerError.message);
    });

    it('retorna o próprio AppError quando o erro já é um AppError', () => {
      const appError = new InvalidFileTypeError(['PNG']);

      expect(handleMulterError(appError)).toBe(appError);
    });

    it('encapsula erros genéricos em FileUploadError', () => {
      const result = handleMulterError(new Error('boom'));

      expect(result).toBeInstanceOf(FileUploadError);
      expect(result.message).toBe('boom');
    });
  });

  describe('requireFile', () => {
    const run = (reqPart: Partial<Request>, fieldName?: string): jest.Mock => {
      const next = jest.fn();
      const middleware = fieldName === undefined ? requireFile() : requireFile(fieldName);
      middleware(reqPart as Request, {}, next);
      return next;
    };

    it('chama next() sem erro quando req.file existe', () => {
      const next = run({ file: {} as Express.Multer.File });

      expect(next).toHaveBeenCalledWith();
    });

    it('chama next() sem erro quando req.files é array não vazio', () => {
      const next = run({ files: [{} as Express.Multer.File] });

      expect(next).toHaveBeenCalledWith();
    });

    it('chama next() sem erro quando req.files é objeto contendo o campo padrão "file"', () => {
      const next = run({ files: { file: [{} as Express.Multer.File] } });

      expect(next).toHaveBeenCalledWith();
    });

    it('respeita o fieldName customizado', () => {
      const next = run({ files: { avatar: [{} as Express.Multer.File] } }, 'avatar');

      expect(next).toHaveBeenCalledWith();
    });

    it('rejeita quando req.files é objeto sem o campo esperado', () => {
      const next = run({ files: { other: [{} as Express.Multer.File] } }, 'avatar');

      expect(next).toHaveBeenCalledWith(expect.any(FileUploadError));
    });

    it('rejeita quando req.files é array vazio', () => {
      const next = run({ files: [] });

      expect(next).toHaveBeenCalledWith(expect.any(FileUploadError));
    });

    it('rejeita com "Nenhum arquivo enviado" quando não há arquivos', () => {
      const next = run({});
      const error = next.mock.calls[0][0] as FileUploadError;

      expect(error).toBeInstanceOf(FileUploadError);
      expect(error.message).toBe('Nenhum arquivo enviado');
    });
  });

  describe('file filters (via multer + supertest)', () => {
    it('uploadAvatar aceita image/png', async () => {
      const app = buildApp(uploadAvatar.single('file'));

      const response = await request(app)
        .post('/upload')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });

      expect(response.status).toBe(200);
      expect(response.body.file).toBe('a.png');
    });

    it('uploadAvatar rejeita tipos não permitidos (svg não é avatar)', async () => {
      const app = buildApp(uploadAvatar.single('file'));

      const response = await request(app)
        .post('/upload')
        .attach('file', Buffer.from('<svg/>'), { filename: 'a.svg', contentType: 'image/svg+xml' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(response.body.message).toContain('Tipos aceitos: JPEG, PNG, WebP, GIF');
    });

    it('uploadImage aceita image/svg+xml', async () => {
      const app = buildApp(uploadImage.single('file'));

      const response = await request(app)
        .post('/upload')
        .attach('file', Buffer.from('<svg/>'), { filename: 'a.svg', contentType: 'image/svg+xml' });

      expect(response.status).toBe(200);
      expect(response.body.file).toBe('a.svg');
    });

    it('uploadImage rejeita application/pdf', async () => {
      const app = buildApp(uploadImage.single('file'));

      const response = await request(app)
        .post('/upload')
        .attach('file', Buffer.from('%PDF'), { filename: 'a.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Tipos aceitos: JPEG, PNG, WebP, GIF');
    });

    it('uploadImages aceita múltiplas imagens', async () => {
      const app = buildApp(uploadImages.array('files'));

      const response = await request(app)
        .post('/upload')
        .attach('files', PNG, { filename: 'a.png', contentType: 'image/png' })
        .attach('files', PNG, { filename: 'b.png', contentType: 'image/png' });

      expect(response.status).toBe(200);
      expect(response.body.files).toEqual(['a.png', 'b.png']);
    });

    it('uploadDocument aceita application/pdf', async () => {
      const app = buildApp(uploadDocument.single('file'));

      const response = await request(app)
        .post('/upload')
        .attach('file', Buffer.from('%PDF'), { filename: 'a.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(200);
      expect(response.body.file).toBe('a.pdf');
    });

    it('uploadDocument rejeita imagens', async () => {
      const app = buildApp(uploadDocument.single('file'));

      const response = await request(app)
        .post('/upload')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Tipos aceitos: PDF, DOC, DOCX, TXT, XLS, XLSX, CSV');
    });

    it('converte excesso de arquivos em FileUploadError (LIMIT_FILE_COUNT)', async () => {
      const app = buildApp(uploadAvatar.array('file'));

      const response = await request(app)
        .post('/upload')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .attach('file', PNG, { filename: 'b.png', contentType: 'image/png' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Número máximo de arquivos excedido');
    });
  });

  describe('uploadToDisk storage', () => {
    const storage = (uploadToDisk as unknown as { storage: DiskStorageInternals }).storage;
    const file = { originalname: 'relatorio.final.pdf' } as Express.Multer.File;

    it('usa o diretório temporário configurado como destino', () => {
      const cb = jest.fn();

      storage.getDestination({} as Request, file, cb);

      expect(cb).toHaveBeenCalledWith(null, uploadConfig.paths.temp);
    });

    it('gera nome "<timestamp base36>-<8 hex><extensão original>"', () => {
      const cb = jest.fn();
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

      storage.getFilename({} as Request, file, cb);

      const [error, filename] = cb.mock.calls[0] as [null, string];
      expect(error).toBeNull();
      expect(filename).toMatch(
        new RegExp(`^${(1_700_000_000_000).toString(36)}-[0-9a-f]{8}\\.pdf$`)
      );
    });

    it('gera nomes diferentes a cada chamada', () => {
      const names: string[] = [];
      const cb: StorageCallback = (_err, name) => names.push(name);

      storage.getFilename({} as Request, file, cb);
      storage.getFilename({} as Request, file, cb);

      expect(names[0]).not.toBe(names[1]);
    });
  });
});
