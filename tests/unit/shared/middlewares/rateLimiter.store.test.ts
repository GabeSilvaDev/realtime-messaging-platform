const mockRedisStoreCtor = jest.fn();

// Função comum (não jest.fn): o jest.config usa resetMocks: true, que apagaria um mockImplementation.
jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: function MockRedisStore(opts: unknown) {
    mockRedisStoreCtor(opts);
    return {
      increment: async () => ({ totalHits: 1, resetTime: new Date() }),
      decrement: async () => undefined,
      resetKey: async () => undefined,
    };
  },
}));

jest.mock('@/shared/database', () => ({
  redis: { call: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import { MemoryStore } from 'express-rate-limit';
import { createRateLimiter, getLoginRateLimiter } from '@/shared/middlewares/rateLimiter';
import {
  RATE_LIMIT_AUTH_MAX_REQUESTS,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_LOGIN_KEY_PREFIX,
} from '@/shared/constants';

describe('rateLimiter — seleção de store e limiter de login', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    mockRedisStoreCtor.mockClear();
  });

  it('deve expor janela de 15 minutos e prefixo de login', () => {
    expect(RATE_LIMIT_AUTH_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(RATE_LIMIT_AUTH_MAX_REQUESTS).toBe(5);
    expect(RATE_LIMIT_LOGIN_KEY_PREFIX).toBe('rl:login:');
  });

  it('deve usar MemoryStore quando NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    createRateLimiter();
    expect(mockRedisStoreCtor).not.toHaveBeenCalled();
  });

  it('deve usar RedisStore fora do ambiente de teste', () => {
    process.env.NODE_ENV = 'development';
    createRateLimiter({ keyPrefix: 'rl:x:' });
    expect(mockRedisStoreCtor).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'rl:x:' }));
  });

  it('deve usar o store injetado', () => {
    process.env.NODE_ENV = 'development';
    createRateLimiter({ store: new MemoryStore() });
    expect(mockRedisStoreCtor).not.toHaveBeenCalled();
  });

  it('deve bloquear após max requisições com o store em memória', async () => {
    process.env.NODE_ENV = 'test';
    const app = express();
    app.get('/', createRateLimiter({ max: 2 }), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    const blocked = await request(app).get('/');

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('com skipSuccessfulRequests deve contar apenas respostas com erro', async () => {
    process.env.NODE_ENV = 'test';
    const app = express();
    let fail = false;
    app.get('/', createRateLimiter({ max: 1, skipSuccessfulRequests: true }), (_req, res) => {
      res.status(fail ? 401 : 200).json({});
    });

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    fail = true;
    await request(app).get('/').expect(401);
    await request(app).get('/').expect(429);
  });

  it('getLoginRateLimiter deve retornar a mesma instância', () => {
    process.env.NODE_ENV = 'test';
    expect(getLoginRateLimiter()).toBe(getLoginRateLimiter());
  });
});
