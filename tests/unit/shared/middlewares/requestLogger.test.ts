import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';

const mockChildLogger = {
  setCategory: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockLogger = {
  child: jest.fn(),
};

jest.mock('@/shared/logger', () => ({
  getLogger: () => mockLogger,
  LogCategory: { HTTP: 'http' },
  LogLevel: { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error', FATAL: 'fatal' },
}));

import requestLoggerDefault, { requestLogger } from '@/shared/middlewares/requestLogger';

interface FakeResponse extends EventEmitter {
  statusCode: number;
  get: jest.Mock;
}

const createReq = (overrides: Partial<Request> = {}): Request => {
  const headers: Record<string, string> = {
    'x-request-id': 'req-123',
    'user-agent': 'jest-agent',
    'content-length': '42',
  };
  return {
    method: 'GET',
    path: '/users',
    originalUrl: '/users?page=1',
    query: { page: '1' },
    ip: '127.0.0.1',
    headers,
    socket: { remoteAddress: '10.0.0.1' },
    get: (name: string) => headers[name.toLowerCase()],
    ...overrides,
  } as unknown as Request;
};

const createRes = (statusCode = 200): FakeResponse => {
  const res = new EventEmitter() as FakeResponse;
  res.statusCode = statusCode;
  res.get = jest.fn().mockReturnValue('application/json');
  return res;
};

describe('requestLogger', () => {
  let next: NextFunction;

  beforeEach(() => {
    mockLogger.child.mockReturnValue(mockChildLogger);
    next = jest.fn();
  });

  it('cria logger filho "RequestLogger" com categoria HTTP e chama next()', () => {
    requestLogger(createReq(), createRes() as unknown as Response, next);

    expect(mockLogger.child).toHaveBeenCalledWith('RequestLogger');
    expect(mockChildLogger.setCategory).toHaveBeenCalledWith('http');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('loga a requisição de entrada com metadados', () => {
    requestLogger(createReq(), createRes() as unknown as Response, next);

    expect(mockChildLogger.info).toHaveBeenCalledWith('[req-123] --> GET /users?page=1', {
      method: 'GET',
      path: '/users',
      query: { page: '1' },
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
      requestId: 'req-123',
      contentLength: '42',
    });
  });

  it('usa "unknown" quando não há x-request-id e cai para socket.remoteAddress sem req.ip', () => {
    const req = createReq({ headers: {}, ip: undefined });

    requestLogger(req, createRes() as unknown as Response, next);

    expect(mockChildLogger.info).toHaveBeenCalledWith(
      '[unknown] --> GET /users?page=1',
      expect.objectContaining({ requestId: 'unknown', ip: '10.0.0.1' })
    );
  });

  it('loga info na resposta 2xx com statusCode, responseTime e contentType', () => {
    const res = createRes(200);
    requestLogger(createReq(), res as unknown as Response, next);

    res.emit('finish');

    expect(mockChildLogger.info).toHaveBeenCalledTimes(2);
    const [message, metadata] = mockChildLogger.info.mock.calls[1] as [
      string,
      Record<string, unknown>,
    ];
    expect(message).toMatch(/^\[req-123\] <-- GET \/users\?page=1 200 \d+\.\d{2}ms$/);
    expect(metadata).toEqual(
      expect.objectContaining({
        statusCode: 200,
        responseTime: expect.any(Number),
        contentType: 'application/json',
        requestId: 'req-123',
      })
    );
    expect(res.get).toHaveBeenCalledWith('content-type');
    expect(mockChildLogger.warn).not.toHaveBeenCalled();
    expect(mockChildLogger.error).not.toHaveBeenCalled();
  });

  it('loga info para 3xx', () => {
    const res = createRes(302);
    requestLogger(createReq(), res as unknown as Response, next);

    res.emit('finish');

    expect(mockChildLogger.info).toHaveBeenCalledTimes(2);
  });

  it('loga warn para respostas 4xx', () => {
    const res = createRes(404);
    requestLogger(createReq(), res as unknown as Response, next);

    res.emit('finish');

    expect(mockChildLogger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[req-123\] <-- GET \/users\?page=1 404 /),
      expect.objectContaining({ statusCode: 404 })
    );
    expect(mockChildLogger.error).not.toHaveBeenCalled();
  });

  it('loga error (sem objeto Error) para respostas 5xx', () => {
    const res = createRes(503);
    requestLogger(createReq(), res as unknown as Response, next);

    res.emit('finish');

    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.stringMatching(/ 503 \d+\.\d{2}ms$/),
      undefined,
      expect.objectContaining({ statusCode: 503 })
    );
    expect(mockChildLogger.warn).not.toHaveBeenCalled();
  });

  it('export default é requestLogger', () => {
    expect(requestLoggerDefault).toBe(requestLogger);
  });
});
