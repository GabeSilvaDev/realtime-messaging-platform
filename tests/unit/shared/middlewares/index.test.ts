import {
  errorHandler,
  requestLogger,
  createRateLimiter,
  getRateLimiter,
  getStrictRateLimiter,
  getAuthRateLimiter,
  getLoginRateLimiter,
  corsMiddleware,
  createCorsMiddleware,
  helmetMiddleware,
  createHelmetMiddleware,
  notFoundHandler,
  requestIdMiddleware,
  createRequestIdMiddleware,
  FileUploadError,
  FileSizeLimitError,
  InvalidFileTypeError,
  handleMulterError,
  requireFile,
  uploadAvatar,
  uploadDocument,
  uploadImage,
  uploadImages,
  uploadToDisk,
} from '@/shared/middlewares';

describe('shared/middlewares index', () => {
  it('deve exportar errorHandler e requestLogger', () => {
    expect(errorHandler).toBeDefined();
    expect(requestLogger).toBeDefined();
  });

  it('deve exportar utilitários de rate limiter', () => {
    expect(createRateLimiter).toBeDefined();
    expect(getRateLimiter).toBeDefined();
    expect(getStrictRateLimiter).toBeDefined();
    expect(getAuthRateLimiter).toBeDefined();
    expect(getLoginRateLimiter).toBeDefined();
  });

  it('deve exportar middlewares de cors', () => {
    expect(corsMiddleware).toBeDefined();
    expect(createCorsMiddleware).toBeDefined();
  });

  it('deve exportar middlewares de helmet', () => {
    expect(helmetMiddleware).toBeDefined();
    expect(createHelmetMiddleware).toBeDefined();
  });

  it('deve exportar notFoundHandler', () => {
    expect(notFoundHandler).toBeDefined();
  });

  it('deve exportar middlewares de requestId', () => {
    expect(requestIdMiddleware).toBeDefined();
    expect(createRequestIdMiddleware).toBeDefined();
  });

  it('deve exportar erros e utilitários de upload', () => {
    expect(FileUploadError).toBeDefined();
    expect(FileSizeLimitError).toBeDefined();
    expect(InvalidFileTypeError).toBeDefined();
    expect(handleMulterError).toBeDefined();
    expect(requireFile).toBeDefined();
    expect(uploadAvatar).toBeDefined();
    expect(uploadDocument).toBeDefined();
    expect(uploadImage).toBeDefined();
    expect(uploadImages).toBeDefined();
    expect(uploadToDisk).toBeDefined();
  });
});
