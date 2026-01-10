import sharp, { type Sharp, type ResizeOptions, type OutputInfo, type Metadata } from 'sharp';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { uploadConfig, type ImageSize } from '@/shared/config/upload';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
  orientation?: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  info: OutputInfo;
  metadata: ImageMetadata;
}

export interface ResizeResult {
  name: string;
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
}

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  fit?: ResizeOptions['fit'];
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  withoutEnlargement?: boolean;
  background?: { r: number; g: number; b: number; alpha?: number };
}

export interface WatermarkOptions {
  text?: string;
  image?: Buffer;
  gravity?:
    | 'north'
    | 'south'
    | 'east'
    | 'west'
    | 'center'
    | 'northeast'
    | 'northwest'
    | 'southeast'
    | 'southwest';
  opacity?: number;
}

export class ImageProcessingError extends AppError {
  constructor(message = 'Erro ao processar imagem') {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_ERROR);
  }
}

export class InvalidImageError extends AppError {
  constructor(message = 'Imagem inválida ou corrompida') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class UnsupportedFormatError extends AppError {
  constructor(format: string) {
    super(
      `Formato de imagem não suportado: ${format}`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export interface IImageProcessorService {
  getMetadata(buffer: Buffer): Promise<ImageMetadata>;
  resize(buffer: Buffer, options: ImageProcessingOptions): Promise<ProcessedImage>;
  resizeMultiple(buffer: Buffer, sizes: ImageSize[]): Promise<ResizeResult[]>;
  optimize(buffer: Buffer, quality?: number): Promise<ProcessedImage>;
  convert(buffer: Buffer, format: 'jpeg' | 'png' | 'webp' | 'avif'): Promise<ProcessedImage>;
  crop(
    buffer: Buffer,
    left: number,
    top: number,
    width: number,
    height: number
  ): Promise<ProcessedImage>;
  rotate(buffer: Buffer, angle: number): Promise<ProcessedImage>;
  flip(buffer: Buffer, direction: 'horizontal' | 'vertical'): Promise<ProcessedImage>;
  blur(buffer: Buffer, sigma?: number): Promise<ProcessedImage>;
  sharpen(buffer: Buffer, sigma?: number): Promise<ProcessedImage>;
  grayscale(buffer: Buffer): Promise<ProcessedImage>;
  addWatermark(buffer: Buffer, options: WatermarkOptions): Promise<ProcessedImage>;
  composite(
    baseBuffer: Buffer,
    overlays: { buffer: Buffer; left: number; top: number }[]
  ): Promise<ProcessedImage>;
  isValidImage(buffer: Buffer): Promise<boolean>;
  generateThumbnail(buffer: Buffer, size?: number): Promise<ProcessedImage>;
  stripMetadata(buffer: Buffer): Promise<ProcessedImage>;
  autoOrient(buffer: Buffer): Promise<ProcessedImage>;
}

export class ImageProcessorService implements IImageProcessorService {
  private readonly defaultQuality: number;
  private readonly defaultFormat: 'jpeg' | 'png' | 'webp';

  constructor(
    defaultQuality: number = uploadConfig.image.quality,
    defaultFormat: 'jpeg' | 'png' | 'webp' = uploadConfig.image.format
  ) {
    this.defaultQuality = defaultQuality;
    this.defaultFormat = defaultFormat;
  }

  async getMetadata(buffer: Buffer): Promise<ImageMetadata> {
    try {
      const metadata: Metadata = await sharp(buffer).metadata();
      const width = metadata.width;
      const height = metadata.height;
      const format = metadata.format;

      if (typeof width !== 'number' || typeof height !== 'number' || typeof format !== 'string') {
        throw new InvalidImageError();
      }

      return {
        width,
        height,
        format,
        size: buffer.length,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao obter metadata da imagem',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new InvalidImageError();
    }
  }

  async resize(buffer: Buffer, options: ImageProcessingOptions): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);
      const format = options.format ?? this.defaultFormat;
      const quality = options.quality ?? this.defaultQuality;

      let pipeline: Sharp = sharp(buffer)
        .rotate()
        .resize({
          width: options.width,
          height: options.height,
          fit: options.fit ?? 'cover',
          withoutEnlargement: options.withoutEnlargement ?? true,
          background: options.background ?? { r: 255, g: 255, b: 255, alpha: 0 },
        });

      pipeline = this.applyFormat(pipeline, format, quality);

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          width: info.width,
          height: info.height,
          format: info.format,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao redimensionar imagem',
        error instanceof Error ? error : new Error(String(error)),
        { options }
      );
      throw new ImageProcessingError('Falha ao redimensionar imagem');
    }
  }

  async resizeMultiple(buffer: Buffer, sizes: ImageSize[]): Promise<ResizeResult[]> {
    const results: ResizeResult[] = [];

    const orientedBuffer = await sharp(buffer).rotate().toBuffer();

    for (const size of sizes) {
      try {
        const processed = await this.resize(orientedBuffer, {
          width: size.width,
          height: size.height,
          fit: size.fit,
        });

        results.push({
          name: size.name,
          buffer: processed.buffer,
          width: processed.info.width,
          height: processed.info.height,
          size: processed.buffer.length,
        });

        logger.debug('Tamanho de imagem gerado', {
          name: size.name,
          width: processed.info.width,
          height: processed.info.height,
          size: processed.buffer.length,
        });
      } catch (error) {
        logger.error(
          'Erro ao gerar tamanho de imagem',
          error instanceof Error ? error : new Error(String(error)),
          { size }
        );
        throw new ImageProcessingError(`Falha ao gerar tamanho: ${size.name}`);
      }
    }

    return results;
  }

  async optimize(buffer: Buffer, quality?: number): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);
      const targetQuality = quality ?? this.defaultQuality;

      let pipeline: Sharp = sharp(buffer).rotate();

      const outputFormat = metadata.hasAlpha ? 'webp' : this.defaultFormat;
      pipeline = this.applyFormat(pipeline, outputFormat, targetQuality);

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          format: info.format,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao otimizar imagem',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new ImageProcessingError('Falha ao otimizar imagem');
    }
  }

  async convert(buffer: Buffer, format: 'jpeg' | 'png' | 'webp' | 'avif'): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);
      let pipeline: Sharp = sharp(buffer).rotate();

      pipeline = this.applyFormat(pipeline, format, this.defaultQuality);

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          format: info.format,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao converter imagem',
        error instanceof Error ? error : new Error(String(error)),
        { format }
      );
      throw new ImageProcessingError(`Falha ao converter para ${format}`);
    }
  }

  async crop(
    buffer: Buffer,
    left: number,
    top: number,
    width: number,
    height: number
  ): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);

      const { data, info } = await sharp(buffer)
        .rotate()
        .extract({ left, top, width, height })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          width: info.width,
          height: info.height,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao cortar imagem',
        error instanceof Error ? error : new Error(String(error)),
        { left, top, width, height }
      );
      throw new ImageProcessingError('Falha ao cortar imagem');
    }
  }

  async rotate(buffer: Buffer, angle: number): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);

      const { data, info } = await sharp(buffer)
        .rotate(angle)
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          width: info.width,
          height: info.height,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao rotacionar imagem',
        error instanceof Error ? error : new Error(String(error)),
        { angle }
      );
      throw new ImageProcessingError('Falha ao rotacionar imagem');
    }
  }

  async flip(buffer: Buffer, direction: 'horizontal' | 'vertical'): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);

      let pipeline: Sharp = sharp(buffer);

      if (direction === 'horizontal') {
        pipeline = pipeline.flop();
      } else {
        pipeline = pipeline.flip();
      }

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao espelhar imagem',
        error instanceof Error ? error : new Error(String(error)),
        { direction }
      );
      throw new ImageProcessingError('Falha ao espelhar imagem');
    }
  }

  async blur(buffer: Buffer, sigma = 3): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);

      const { data, info } = await sharp(buffer).blur(sigma).toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao aplicar blur na imagem',
        error instanceof Error ? error : new Error(String(error)),
        { sigma }
      );
      throw new ImageProcessingError('Falha ao aplicar blur');
    }
  }

  async sharpen(buffer: Buffer, sigma = 1): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);

      const { data, info } = await sharp(buffer)
        .sharpen({ sigma })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao aplicar sharpen na imagem',
        error instanceof Error ? error : new Error(String(error)),
        { sigma }
      );
      throw new ImageProcessingError('Falha ao aplicar sharpen');
    }
  }

  async grayscale(buffer: Buffer): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);

      const { data, info } = await sharp(buffer).grayscale().toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao converter para escala de cinza',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new ImageProcessingError('Falha ao converter para escala de cinza');
    }
  }

  async addWatermark(buffer: Buffer, options: WatermarkOptions): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);
      const gravity = options.gravity ?? 'southeast';

      let compositeInput: sharp.OverlayOptions[];

      if (options.image) {
        compositeInput = [
          {
            input: options.image,
            gravity,
            blend: 'over',
          },
        ];
      } else if (options.text !== undefined && options.text !== '') {
        const opacity = String(options.opacity ?? 0.5);
        const svgText = `
          <svg width="200" height="50">
            <text x="50%" y="50%" text-anchor="middle" dy=".3em" 
                  fill="white" font-size="24" font-family="Arial"
                  opacity="${opacity}">
              ${options.text}
            </text>
          </svg>
        `;
        compositeInput = [
          {
            input: Buffer.from(svgText),
            gravity,
          },
        ];
      } else {
        throw new ImageProcessingError('Watermark requer texto ou imagem');
      }

      const { data, info } = await sharp(buffer)
        .composite(compositeInput)
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao adicionar watermark',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new ImageProcessingError('Falha ao adicionar watermark');
    }
  }

  async composite(
    baseBuffer: Buffer,
    overlays: { buffer: Buffer; left: number; top: number }[]
  ): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(baseBuffer);

      const compositeInputs = overlays.map((overlay) => ({
        input: overlay.buffer,
        left: overlay.left,
        top: overlay.top,
      }));

      const { data, info } = await sharp(baseBuffer)
        .composite(compositeInputs)
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao compor imagens',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new ImageProcessingError('Falha ao compor imagens');
    }
  }

  async isValidImage(buffer: Buffer): Promise<boolean> {
    try {
      const metadata = await sharp(buffer).metadata();
      return !!(metadata.width && metadata.height && metadata.format);
    } catch {
      return false;
    }
  }

  async generateThumbnail(buffer: Buffer, size = 150): Promise<ProcessedImage> {
    return this.resize(buffer, {
      width: size,
      height: size,
      fit: 'cover',
    });
  }

  async stripMetadata(buffer: Buffer): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);

      const { data, info } = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao remover metadata da imagem',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new ImageProcessingError('Falha ao remover metadata');
    }
  }

  async autoOrient(buffer: Buffer): Promise<ProcessedImage> {
    try {
      const metadata = await this.getMetadata(buffer);

      const { data, info } = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        info,
        metadata: {
          ...metadata,
          width: info.width,
          height: info.height,
          size: data.length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(
        'Erro ao auto-orientar imagem',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new ImageProcessingError('Falha ao auto-orientar imagem');
    }
  }

  private applyFormat(pipeline: Sharp, format: string, quality: number): Sharp {
    switch (format) {
      case 'jpeg':
      case 'jpg':
        return pipeline.jpeg({ quality, mozjpeg: true });
      case 'png':
        return pipeline.png({ compressionLevel: 9, palette: true });
      case 'webp':
        return pipeline.webp({ quality, lossless: false });
      case 'avif':
        return pipeline.avif({ quality });
      default:
        return pipeline.webp({ quality });
    }
  }
}

export const imageProcessorService = new ImageProcessorService();
