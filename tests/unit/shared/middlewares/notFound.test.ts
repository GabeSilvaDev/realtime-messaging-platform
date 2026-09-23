import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

const mockChildLogger = {
  setCategory: jest.fn(),
  warn: jest.fn(),
};

const mockLogger = {
  child: jest.fn(),
};

jest.mock('@/shared/logger', () => ({
  getLogger: () => mockLogger,
  LogCategory: { HTTP: 'http' },
}));

import notFoundHandlerDefault, { notFoundHandler } from '@/shared/middlewares/notFound';

const createReq = (overrides: Partial<Request> = {}): Request => {
  const headers: Record<string, string> = {
    'x-request-id': 'req-404',
    'user-agent': 'jest-agent',
  };
  return {
    method: 'POST',
    path: '/api/unknown',
    originalUrl: '/api/unknown?x=1',
    ip: '127.0.0.1',
    headers,
    socket: { remoteAddress: '10.0.0.1' },
    get: (name: string) => headers[name.toLowerCase()],
    ...overrides,
  } as unknown as Request;
};

describe('notFoundHandler', () => {
  let next: jest.Mock;

  beforeEach(() => {
    mockLogger.child.mockReturnValue(mockChildLogger);
    next = jest.fn();
  });

  it('encaminha AppError 404 com método e path na mensagem', () => {
    notFoundHandler(createReq(), {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Cannot POST /api/unknown');
    expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('loga warn com metadados da requisição usando logger filho HTTP', () => {
    notFoundHandler(createReq(), {} as Response, next as NextFunction);

    expect(mockLogger.child).toHaveBeenCalledWith('NotFoundHandler');
    expect(mockChildLogger.setCategory).toHaveBeenCalledWith('http');
    expect(mockChildLogger.warn).toHaveBeenCalledWith(
      '[req-404] Route not found: POST /api/unknown?x=1',
      {
        method: 'POST',
        path: '/api/unknown?x=1',
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
        requestId: 'req-404',
      }
    );
  });

  it('usa "unknown" sem x-request-id e socket.remoteAddress sem req.ip', () => {
    const req = createReq({ headers: {}, ip: undefined });

    notFoundHandler(req, {} as Response, next as NextFunction);

    expect(mockChildLogger.warn).toHaveBeenCalledWith(
      '[unknown] Route not found: POST /api/unknown?x=1',
      expect.objectContaining({ requestId: 'unknown', ip: '10.0.0.1' })
    );
  });

  it('export default é notFoundHandler', () => {
    expect(notFoundHandlerDefault).toBe(notFoundHandler);
  });
});
