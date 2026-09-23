jest.mock('sharp', () => jest.fn());

jest.mock('@/shared/logger', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/shared/config/upload', () => ({
  uploadConfig: {
    image: { quality: 85, format: 'webp' },
  },
}));

import sharp from 'sharp';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import {
  ImageProcessorService,
  ImageProcessingError,
  InvalidImageError,
  UnsupportedFormatError,
  imageProcessorService,
  type ProcessedImage,
} from '@/shared/services/ImageProcessorService';

interface MockPipeline {
  metadata: jest.Mock;
  rotate: jest.Mock;
  resize: jest.Mock;
  jpeg: jest.Mock;
  png: jest.Mock;
  webp: jest.Mock;
  avif: jest.Mock;
  extract: jest.Mock;
  flop: jest.Mock;
  flip: jest.Mock;
  blur: jest.Mock;
  sharpen: jest.Mock;
  grayscale: jest.Mock;
  composite: jest.Mock;
  toBuffer: jest.Mock;
}

const mockedSharp = sharp as unknown as jest.Mock;
const mockedLogger = logger as unknown as { error: jest.Mock; debug: jest.Mock };

const INPUT = Buffer.from('input-image');
const OUTPUT = Buffer.from('processed-output');
const OUTPUT_INFO = { width: 100, height: 80, format: 'webp', size: OUTPUT.length };
const DEFAULT_METADATA = {
  width: 400,
  height: 300,
  format: 'jpeg',
  hasAlpha: false,
  orientation: 1,
};

let pipeline: MockPipeline;

const createPipeline = (): MockPipeline => {
  const p = {} as MockPipeline;
  const chainable: (keyof MockPipeline)[] = [
    'rotate',
    'resize',
    'jpeg',
    'png',
    'webp',
    'avif',
    'extract',
    'flop',
    'flip',
    'blur',
    'sharpen',
    'grayscale',
    'composite',
  ];
  for (const method of chainable) {
    p[method] = jest.fn().mockReturnValue(p);
  }
  p.metadata = jest.fn().mockResolvedValue(DEFAULT_METADATA);
  p.toBuffer = jest.fn((options?: { resolveWithObject?: boolean }) =>
    Promise.resolve(
      options?.resolveWithObject === true ? { data: OUTPUT, info: OUTPUT_INFO } : OUTPUT
    )
  );
  return p;
};

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(() => {
    pipeline = createPipeline();
    mockedSharp.mockImplementation(() => pipeline);
    service = new ImageProcessorService();
  });

  describe('classes de erro', () => {
    it('deve criar ImageProcessingError com mensagem padrão e customizada', () => {
      const defaultError = new ImageProcessingError();
      const customError = new ImageProcessingError('custom');

      expect(defaultError).toBeInstanceOf(AppError);
      expect(defaultError.message).toBe('Erro ao processar imagem');
      expect(defaultError.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(defaultError.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(customError.message).toBe('custom');
    });

    it('deve criar InvalidImageError com mensagem padrão e customizada', () => {
      const defaultError = new InvalidImageError();
      const customError = new InvalidImageError('custom');

      expect(defaultError.message).toBe('Imagem inválida ou corrompida');
      expect(defaultError.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(customError.message).toBe('custom');
    });

    it('deve criar UnsupportedFormatError com o formato na mensagem', () => {
      const error = new UnsupportedFormatError('bmp');

      expect(error.message).toBe('Formato de imagem não suportado: bmp');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('singleton', () => {
    it('deve exportar uma instância de ImageProcessorService', () => {
      expect(imageProcessorService).toBeInstanceOf(ImageProcessorService);
    });
  });

  describe('getMetadata', () => {
    it('deve retornar a metadata da imagem', async () => {
      const result = await service.getMetadata(INPUT);

      expect(mockedSharp).toHaveBeenCalledWith(INPUT);
      expect(result).toEqual({
        width: 400,
        height: 300,
        format: 'jpeg',
        size: INPUT.length,
        hasAlpha: false,
        orientation: 1,
      });
    });

    it.each([
      ['width ausente', { ...DEFAULT_METADATA, width: undefined }],
      ['height ausente', { ...DEFAULT_METADATA, height: undefined }],
      ['format ausente', { ...DEFAULT_METADATA, format: undefined }],
    ])('deve lançar InvalidImageError quando %s', async (_label, metadata) => {
      pipeline.metadata.mockResolvedValue(metadata);

      await expect(service.getMetadata(INPUT)).rejects.toBeInstanceOf(InvalidImageError);
      expect(mockedLogger.error).not.toHaveBeenCalled();
    });

    it('deve logar e lançar InvalidImageError quando o sharp lança um Error', async () => {
      const error = new Error('corrupt');
      pipeline.metadata.mockRejectedValue(error);

      await expect(service.getMetadata(INPUT)).rejects.toBeInstanceOf(InvalidImageError);
      expect(mockedLogger.error).toHaveBeenCalledWith('Erro ao obter metadata da imagem', error);
    });

    it('deve converter erro que não é Error antes de logar', async () => {
      pipeline.metadata.mockRejectedValue('boom');

      await expect(service.getMetadata(INPUT)).rejects.toBeInstanceOf(InvalidImageError);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Erro ao obter metadata da imagem',
        new Error('boom')
      );
    });
  });

  describe('resize', () => {
    it('deve redimensionar usando os valores padrão', async () => {
      const result = await service.resize(INPUT, { width: 100, height: 80 });

      expect(pipeline.rotate).toHaveBeenCalledWith();
      expect(pipeline.resize).toHaveBeenCalledWith({
        width: 100,
        height: 80,
        fit: 'cover',
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      });
      expect(pipeline.webp).toHaveBeenCalledWith({ quality: 85, lossless: false });
      expect(pipeline.toBuffer).toHaveBeenCalledWith({ resolveWithObject: true });
      expect(result).toEqual({
        buffer: OUTPUT,
        info: OUTPUT_INFO,
        metadata: {
          width: 100,
          height: 80,
          format: 'webp',
          size: OUTPUT.length,
          hasAlpha: false,
          orientation: 1,
        },
      });
    });

    it('deve respeitar as opções informadas', async () => {
      const background = { r: 0, g: 0, b: 0, alpha: 1 };

      await service.resize(INPUT, {
        width: 50,
        fit: 'contain',
        withoutEnlargement: false,
        background,
        format: 'jpeg',
        quality: 40,
      });

      expect(pipeline.resize).toHaveBeenCalledWith({
        width: 50,
        height: undefined,
        fit: 'contain',
        withoutEnlargement: false,
        background,
      });
      expect(pipeline.jpeg).toHaveBeenCalledWith({ quality: 40, mozjpeg: true });
    });
  });

  describe('applyFormat (via resize/convert/constructor)', () => {
    it('deve aplicar png', async () => {
      await service.resize(INPUT, { format: 'png' });
      expect(pipeline.png).toHaveBeenCalledWith({ compressionLevel: 9, palette: true });
    });

    it('deve aplicar avif', async () => {
      await service.resize(INPUT, { format: 'avif', quality: 50 });
      expect(pipeline.avif).toHaveBeenCalledWith({ quality: 50 });
    });

    it('deve aplicar jpeg para o alias jpg', async () => {
      const jpgService = new ImageProcessorService(70, 'jpg' as unknown as 'jpeg');

      await jpgService.optimize(INPUT);

      expect(pipeline.jpeg).toHaveBeenCalledWith({ quality: 70, mozjpeg: true });
    });

    it('deve usar webp como fallback para formato desconhecido', async () => {
      await service.convert(INPUT, 'gif' as unknown as 'png');

      expect(pipeline.webp).toHaveBeenCalledWith({ quality: 85 });
    });
  });

  describe('resizeMultiple', () => {
    const sizes = [
      { name: 'large', width: 512, height: 512, fit: 'cover' as const },
      { name: 'small', width: 128, height: 128, fit: 'inside' as const },
    ];

    it('deve gerar todos os tamanhos a partir do buffer orientado', async () => {
      const resizeSpy = jest.spyOn(service, 'resize');

      const results = await service.resizeMultiple(INPUT, sizes);

      expect(pipeline.toBuffer).toHaveBeenNthCalledWith(1);
      expect(resizeSpy).toHaveBeenNthCalledWith(1, OUTPUT, {
        width: 512,
        height: 512,
        fit: 'cover',
      });
      expect(resizeSpy).toHaveBeenNthCalledWith(2, OUTPUT, {
        width: 128,
        height: 128,
        fit: 'inside',
      });
      expect(results).toEqual([
        { name: 'large', buffer: OUTPUT, width: 100, height: 80, size: OUTPUT.length },
        { name: 'small', buffer: OUTPUT, width: 100, height: 80, size: OUTPUT.length },
      ]);
      expect(mockedLogger.debug).toHaveBeenCalledTimes(2);
    });

    it('deve retornar lista vazia quando não há tamanhos', async () => {
      await expect(service.resizeMultiple(INPUT, [])).resolves.toEqual([]);
    });

    it('deve lançar ImageProcessingError com o nome do tamanho que falhou', async () => {
      pipeline.metadata.mockRejectedValue(new Error('corrupt'));

      await expect(service.resizeMultiple(INPUT, sizes)).rejects.toThrow(
        new ImageProcessingError('Falha ao gerar tamanho: large')
      );
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Erro ao gerar tamanho de imagem',
        expect.any(InvalidImageError),
        { size: sizes[0] }
      );
    });

    it('deve propagar erro da orientação inicial sem encapsular', async () => {
      pipeline.toBuffer.mockRejectedValueOnce(new Error('rotate failed'));

      await expect(service.resizeMultiple(INPUT, sizes)).rejects.toThrow('rotate failed');
    });
  });

  describe('optimize', () => {
    it('deve otimizar usando o formato padrão quando não há canal alpha', async () => {
      const result = await service.optimize(INPUT);

      expect(pipeline.rotate).toHaveBeenCalledWith();
      expect(pipeline.webp).toHaveBeenCalledWith({ quality: 85, lossless: false });
      expect(result.metadata).toEqual({
        width: 400,
        height: 300,
        format: 'webp',
        size: OUTPUT.length,
        hasAlpha: false,
        orientation: 1,
      });
    });

    it('deve usar webp quando a imagem tem canal alpha e respeitar a qualidade', async () => {
      const jpegService = new ImageProcessorService(90, 'jpeg');
      pipeline.metadata.mockResolvedValue({ ...DEFAULT_METADATA, hasAlpha: true });

      await jpegService.optimize(INPUT, 30);

      expect(pipeline.webp).toHaveBeenCalledWith({ quality: 30, lossless: false });
      expect(pipeline.jpeg).not.toHaveBeenCalled();
    });

    it('deve usar o formato padrão do construtor quando não há alpha', async () => {
      const jpegService = new ImageProcessorService(90, 'jpeg');

      await jpegService.optimize(INPUT);

      expect(pipeline.jpeg).toHaveBeenCalledWith({ quality: 90, mozjpeg: true });
    });
  });

  describe('convert', () => {
    it('deve converter para o formato solicitado com a qualidade padrão', async () => {
      const result = await service.convert(INPUT, 'png');

      expect(pipeline.rotate).toHaveBeenCalledWith();
      expect(pipeline.png).toHaveBeenCalled();
      expect(result.metadata.format).toBe('webp');
      expect(result.metadata.size).toBe(OUTPUT.length);
    });
  });

  describe('crop', () => {
    it('deve recortar a região informada', async () => {
      const result = await service.crop(INPUT, 10, 20, 100, 80);

      expect(pipeline.extract).toHaveBeenCalledWith({ left: 10, top: 20, width: 100, height: 80 });
      expect(result.metadata).toMatchObject({ width: 100, height: 80, size: OUTPUT.length });
    });
  });

  describe('rotate', () => {
    it('deve rotacionar pelo ângulo informado', async () => {
      const result = await service.rotate(INPUT, 90);

      expect(pipeline.rotate).toHaveBeenCalledWith(90);
      expect(result.metadata).toMatchObject({ width: 100, height: 80 });
    });
  });

  describe('flip', () => {
    it('deve espelhar horizontalmente com flop', async () => {
      await service.flip(INPUT, 'horizontal');

      expect(pipeline.flop).toHaveBeenCalled();
      expect(pipeline.flip).not.toHaveBeenCalled();
    });

    it('deve espelhar verticalmente com flip', async () => {
      const result = await service.flip(INPUT, 'vertical');

      expect(pipeline.flip).toHaveBeenCalled();
      expect(pipeline.flop).not.toHaveBeenCalled();
      expect(result.metadata).toMatchObject({ width: 400, height: 300, size: OUTPUT.length });
    });
  });

  describe('blur', () => {
    it('deve usar sigma padrão 3', async () => {
      await service.blur(INPUT);
      expect(pipeline.blur).toHaveBeenCalledWith(3);
    });

    it('deve usar o sigma informado', async () => {
      await service.blur(INPUT, 7);
      expect(pipeline.blur).toHaveBeenCalledWith(7);
    });
  });

  describe('sharpen', () => {
    it('deve usar sigma padrão 1', async () => {
      await service.sharpen(INPUT);
      expect(pipeline.sharpen).toHaveBeenCalledWith({ sigma: 1 });
    });

    it('deve usar o sigma informado', async () => {
      await service.sharpen(INPUT, 2);
      expect(pipeline.sharpen).toHaveBeenCalledWith({ sigma: 2 });
    });
  });

  describe('grayscale', () => {
    it('deve converter para escala de cinza', async () => {
      const result = await service.grayscale(INPUT);

      expect(pipeline.grayscale).toHaveBeenCalled();
      expect(result.buffer).toBe(OUTPUT);
    });
  });

  describe('addWatermark', () => {
    it('deve aplicar watermark de imagem com gravidade padrão', async () => {
      const watermark = Buffer.from('logo');

      await service.addWatermark(INPUT, { image: watermark });

      expect(pipeline.composite).toHaveBeenCalledWith([
        { input: watermark, gravity: 'southeast', blend: 'over' },
      ]);
    });

    it('deve aplicar watermark de texto com opacidade padrão', async () => {
      await service.addWatermark(INPUT, { text: 'Marca', gravity: 'north' });

      const [[inputs]] = pipeline.composite.mock.calls as [[{ input: Buffer; gravity: string }[]]];
      const svg = inputs[0]?.input.toString() ?? '';
      expect(inputs[0]?.gravity).toBe('north');
      expect(svg).toContain('opacity="0.5"');
      expect(svg).toContain('Marca');
    });

    it('deve aplicar watermark de texto com a opacidade informada', async () => {
      await service.addWatermark(INPUT, { text: 'Marca', opacity: 0.8 });

      const [[inputs]] = pipeline.composite.mock.calls as [[{ input: Buffer; gravity: string }[]]];
      expect(inputs[0]?.gravity).toBe('southeast');
      expect(inputs[0]?.input.toString()).toContain('opacity="0.8"');
    });

    it.each([
      ['sem texto e sem imagem', {}],
      ['com texto vazio', { text: '' }],
    ])('deve lançar ImageProcessingError %s', async (_label, options) => {
      await expect(service.addWatermark(INPUT, options)).rejects.toThrow(
        new ImageProcessingError('Watermark requer texto ou imagem')
      );
      expect(pipeline.composite).not.toHaveBeenCalled();
      expect(mockedLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('composite', () => {
    it('deve compor as camadas informadas', async () => {
      const overlay = Buffer.from('overlay');

      await service.composite(INPUT, [{ buffer: overlay, left: 5, top: 6 }]);

      expect(pipeline.composite).toHaveBeenCalledWith([{ input: overlay, left: 5, top: 6 }]);
    });
  });

  describe('isValidImage', () => {
    it('deve retornar true para imagem com width, height e format', async () => {
      await expect(service.isValidImage(INPUT)).resolves.toBe(true);
    });

    it.each([
      ['width', { ...DEFAULT_METADATA, width: 0 }],
      ['height', { ...DEFAULT_METADATA, height: undefined }],
      ['format', { ...DEFAULT_METADATA, format: undefined }],
    ])('deve retornar false quando falta %s', async (_label, metadata) => {
      pipeline.metadata.mockResolvedValue(metadata);

      await expect(service.isValidImage(INPUT)).resolves.toBe(false);
    });

    it('deve retornar false quando o sharp lança erro', async () => {
      pipeline.metadata.mockRejectedValue(new Error('corrupt'));

      await expect(service.isValidImage(INPUT)).resolves.toBe(false);
    });
  });

  describe('generateThumbnail', () => {
    it('deve gerar thumbnail com tamanho padrão 150', async () => {
      const resizeSpy = jest.spyOn(service, 'resize');

      await service.generateThumbnail(INPUT);

      expect(resizeSpy).toHaveBeenCalledWith(INPUT, { width: 150, height: 150, fit: 'cover' });
    });

    it('deve gerar thumbnail com o tamanho informado', async () => {
      const resizeSpy = jest.spyOn(service, 'resize');

      await service.generateThumbnail(INPUT, 64);

      expect(resizeSpy).toHaveBeenCalledWith(INPUT, { width: 64, height: 64, fit: 'cover' });
    });
  });

  describe('stripMetadata', () => {
    it('deve reprocessar a imagem aplicando a orientação', async () => {
      const result = await service.stripMetadata(INPUT);

      expect(pipeline.rotate).toHaveBeenCalledWith();
      expect(result.metadata).toMatchObject({ width: 400, height: 300, size: OUTPUT.length });
    });
  });

  describe('autoOrient', () => {
    it('deve auto-orientar e atualizar as dimensões', async () => {
      const result = await service.autoOrient(INPUT);

      expect(pipeline.rotate).toHaveBeenCalledWith();
      expect(result.metadata).toMatchObject({ width: 100, height: 80, size: OUTPUT.length });
    });
  });

  describe('tratamento de erros dos métodos de processamento', () => {
    type Operation = (s: ImageProcessorService) => Promise<ProcessedImage>;

    const cases: [string, Operation, string, string, unknown][] = [
      [
        'resize',
        (s) => s.resize(INPUT, { width: 10 }),
        'Erro ao redimensionar imagem',
        'Falha ao redimensionar imagem',
        { options: { width: 10 } },
      ],
      [
        'optimize',
        (s) => s.optimize(INPUT),
        'Erro ao otimizar imagem',
        'Falha ao otimizar imagem',
        undefined,
      ],
      [
        'convert',
        (s) => s.convert(INPUT, 'png'),
        'Erro ao converter imagem',
        'Falha ao converter para png',
        { format: 'png' },
      ],
      [
        'crop',
        (s) => s.crop(INPUT, 1, 2, 3, 4),
        'Erro ao cortar imagem',
        'Falha ao cortar imagem',
        { left: 1, top: 2, width: 3, height: 4 },
      ],
      [
        'rotate',
        (s) => s.rotate(INPUT, 45),
        'Erro ao rotacionar imagem',
        'Falha ao rotacionar imagem',
        { angle: 45 },
      ],
      [
        'flip',
        (s) => s.flip(INPUT, 'horizontal'),
        'Erro ao espelhar imagem',
        'Falha ao espelhar imagem',
        { direction: 'horizontal' },
      ],
      [
        'blur',
        (s) => s.blur(INPUT),
        'Erro ao aplicar blur na imagem',
        'Falha ao aplicar blur',
        { sigma: 3 },
      ],
      [
        'sharpen',
        (s) => s.sharpen(INPUT),
        'Erro ao aplicar sharpen na imagem',
        'Falha ao aplicar sharpen',
        { sigma: 1 },
      ],
      [
        'grayscale',
        (s) => s.grayscale(INPUT),
        'Erro ao converter para escala de cinza',
        'Falha ao converter para escala de cinza',
        undefined,
      ],
      [
        'addWatermark',
        (s) => s.addWatermark(INPUT, { text: 'x' }),
        'Erro ao adicionar watermark',
        'Falha ao adicionar watermark',
        undefined,
      ],
      [
        'composite',
        (s) => s.composite(INPUT, []),
        'Erro ao compor imagens',
        'Falha ao compor imagens',
        undefined,
      ],
      [
        'stripMetadata',
        (s) => s.stripMetadata(INPUT),
        'Erro ao remover metadata da imagem',
        'Falha ao remover metadata',
        undefined,
      ],
      [
        'autoOrient',
        (s) => s.autoOrient(INPUT),
        'Erro ao auto-orientar imagem',
        'Falha ao auto-orientar imagem',
        undefined,
      ],
    ];

    const expectedLogArgs = (logMessage: string, error: Error, context: unknown): unknown[] =>
      context === undefined ? [logMessage, error] : [logMessage, error, context];

    describe.each(cases)('%s', (_name, operation, logMessage, errorMessage, context) => {
      it('deve repassar AppError sem logar (ex.: imagem inválida)', async () => {
        pipeline.metadata.mockResolvedValue({ ...DEFAULT_METADATA, width: undefined });

        await expect(operation(service)).rejects.toBeInstanceOf(InvalidImageError);
        expect(mockedLogger.error).not.toHaveBeenCalled();
      });

      it('deve logar e lançar ImageProcessingError quando o sharp lança Error', async () => {
        const error = new Error('sharp failure');
        pipeline.toBuffer.mockRejectedValue(error);

        await expect(operation(service)).rejects.toThrow(new ImageProcessingError(errorMessage));
        expect(mockedLogger.error).toHaveBeenCalledWith(
          ...expectedLogArgs(logMessage, error, context)
        );
      });

      it('deve converter erro que não é Error antes de logar', async () => {
        pipeline.toBuffer.mockRejectedValue('raw failure');

        await expect(operation(service)).rejects.toBeInstanceOf(ImageProcessingError);
        expect(mockedLogger.error).toHaveBeenCalledWith(
          ...expectedLogArgs(logMessage, new Error('raw failure'), context)
        );
      });
    });
  });
});
