import {
  LocalStorageService,
  S3StorageService,
  StorageUploadError,
  StorageDownloadError,
  StorageDeleteError,
  StorageFileNotFoundError,
  createStorageService,
  storageService,
  ImageProcessorService,
  ImageProcessingError,
  InvalidImageError,
  UnsupportedFormatError,
  imageProcessorService,
  FileService,
  FileTooLargeError,
  InvalidFileTypeError,
  FileNotFoundError,
  FileUploadError,
  fileService,
} from '@/shared/services';

describe('shared/services index', () => {
  it('deve exportar as classes e utilitários de StorageService', () => {
    expect(typeof LocalStorageService).toBe('function');
    expect(typeof S3StorageService).toBe('function');
    expect(typeof StorageUploadError).toBe('function');
    expect(typeof StorageDownloadError).toBe('function');
    expect(typeof StorageDeleteError).toBe('function');
    expect(typeof StorageFileNotFoundError).toBe('function');
    expect(typeof createStorageService).toBe('function');
    expect(storageService).toBeDefined();
  });

  it('deve exportar as classes e utilitários de ImageProcessorService', () => {
    expect(typeof ImageProcessorService).toBe('function');
    expect(typeof ImageProcessingError).toBe('function');
    expect(typeof InvalidImageError).toBe('function');
    expect(typeof UnsupportedFormatError).toBe('function');
    expect(imageProcessorService).toBeInstanceOf(ImageProcessorService);
  });

  it('deve exportar as classes e utilitários de FileService', () => {
    expect(typeof FileService).toBe('function');
    expect(typeof FileTooLargeError).toBe('function');
    expect(typeof InvalidFileTypeError).toBe('function');
    expect(typeof FileNotFoundError).toBe('function');
    expect(typeof FileUploadError).toBe('function');
    expect(fileService).toBeInstanceOf(FileService);
  });
});
