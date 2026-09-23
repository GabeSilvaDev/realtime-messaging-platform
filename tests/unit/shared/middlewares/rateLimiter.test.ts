import express, { type Request, type RequestHandler } from 'express';
import request from 'supertest';
import {
  RATE_LIMIT_AUTH_KEY_PREFIX,
  RATE_LIMIT_AUTH_MAX_REQUESTS,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_DEFAULT_KEY_PREFIX,
  RATE_LIMIT_DEFAULT_MAX_REQUESTS,
  RATE_LIMIT_STRICT_KEY_PREFIX,
  RATE_LIMIT_STRICT_MAX_REQUESTS,
} from '@/shared/constants';
import { ErrorCode, HttpStatus } from '@/shared/errors';

interface MockStoreOptions {
  sendCommand: (...args: string[]) => Promise<number | string>;
  prefix: string;
}

// Store em memória que substitui o RedisStore. É uma classe "de verdade"
// (não jest.fn) para não ser afetada por resetMocks/restoreMocks do jest.config.
// Os nomes começam com "mock" para poderem ser referenciados dentro de jest.mock().
const mockCreatedStores: MockRedisStore[] = [];

class MockRedisStore {
  public readonly options: MockStoreOptions;
  public readonly prefix: string;
  private readonly hits = new Map<string, number>();

  constructor(options: MockStoreOptions) {
    this.options = options;
    this.prefix = options.prefix;
    mockCreatedStores.push(this);
  }

  increment(key: string): { totalHits: number; resetTime: Date } {
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    return { totalHits, resetTime: new Date(Date.now() + 60_000) };
  }

  decrement(key: string): void {
    this.hits.set(key, Math.max(0, (this.hits.get(key) ?? 1) - 1));
  }

  resetKey(key: string): void {
    this.hits.delete(key);
  }
}

const mockRedisCall = { fn: (..._args: unknown[]): Promise<unknown> => Promise.resolve('OK') };

jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/shared/database', () => ({
  redis: {
    call: (...args: unknown[]): Promise<unknown> => mockRedisCall.fn(...args),
  },
}));

import RedisStore from 'rate-limit-redis';
import createRateLimiterDefault, {
  authRateLimiter,
  createRateLimiter,
  getAuthRateLimiter,
  getRateLimiter,
  getStrictRateLimiter,
  rateLimiter,
  strictRateLimiter,
} from '@/shared/middlewares/rateLimiter';

const lastStore = (): MockRedisStore => {
  const store = mockCreatedStores[mockCreatedStores.length - 1];
  if (store === undefined) {
    throw new Error('nenhum store criado');
  }
  return store;
};

const buildApp = (limiter: RequestHandler): express.Application => {
  const app = express();
  app.use(limiter);
  app.get('/test', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
};

describe('rateLimiter middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Fora do subprojeto 0, NODE_ENV=test passou a selecionar MemoryStore por padrão;
    // este arquivo cobre o caminho do RedisStore, então força 'development' aqui.
    process.env.NODE_ENV = 'development';
    // resetMocks zera a implementação do jest.fn do mock a cada teste
    (RedisStore as unknown as jest.Mock).mockImplementation(
      (options: MockStoreOptions) => new MockRedisStore(options)
    );
    mockRedisCall.fn = jest.fn().mockResolvedValue('OK');
    mockCreatedStores.length = 0;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('createRateLimiter', () => {
    it('cria RedisStore com o prefixo padrão quando nenhuma opção é passada', () => {
      createRateLimiter();

      expect(RedisStore).toHaveBeenCalledTimes(1);
      expect(lastStore().options.prefix).toBe(RATE_LIMIT_DEFAULT_KEY_PREFIX);
    });

    it('aplica o limite padrão nos headers RateLimit padronizados, sem headers legados', async () => {
      const app = buildApp(createRateLimiter());

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.headers['ratelimit-limit']).toBe(String(RATE_LIMIT_DEFAULT_MAX_REQUESTS));
      expect(response.headers['ratelimit-remaining']).toBe(
        String(RATE_LIMIT_DEFAULT_MAX_REQUESTS - 1)
      );
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('responde 429 com payload de erro padronizado ao exceder o limite (com x-request-id)', async () => {
      const app = buildApp(createRateLimiter({ max: 1, message: 'Calma aí' }));

      await request(app).get('/test').set('x-request-id', 'req-1');
      const response = await request(app).get('/test').set('x-request-id', 'req-2');

      expect(response.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Calma aí',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          timestamp: expect.any(String),
          requestId: 'req-2',
        },
      });
      expect(new Date(response.body.error.timestamp).toISOString()).toBe(
        response.body.error.timestamp
      );
    });

    it('usa requestId "unknown" e a mensagem padrão quando não informados', async () => {
      const app = buildApp(createRateLimiter({ max: 1 }));

      await request(app).get('/test');
      const response = await request(app).get('/test');

      expect(response.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(response.body.error.requestId).toBe('unknown');
      expect(response.body.error.message).toBe('Too many requests, please try again later');
    });

    it('respeita windowMs, keyPrefix, skip e keyGenerator customizados', async () => {
      const skip = jest.fn((req: Request) => req.path === '/skip');
      const keyGenerator = jest.fn(() => 'chave-fixa');
      const limiter = createRateLimiter({
        windowMs: 1000,
        max: 5,
        keyPrefix: 'custom:',
        skip,
        keyGenerator,
      });
      const app = buildApp(limiter);
      app.get('/skip', (_req, res) => {
        res.status(200).json({ skipped: true });
      });

      const normal = await request(app).get('/test');
      const skipped = await request(app).get('/skip');

      expect(lastStore().options.prefix).toBe('custom:');
      expect(normal.headers['ratelimit-limit']).toBe('5');
      expect(normal.headers['ratelimit-policy']).toBe('5;w=1');
      expect(keyGenerator).toHaveBeenCalledTimes(1);
      expect(skip).toHaveBeenCalledTimes(2);
      expect(skipped.headers['ratelimit-limit']).toBeUndefined();
    });
  });

  describe('sendCommand do RedisStore', () => {
    it('repassa comando e argumentos para redis.call e retorna o resultado', async () => {
      mockRedisCall.fn = jest.fn().mockResolvedValue(7);
      createRateLimiter();

      const result = await lastStore().options.sendCommand('INCR', 'rl:key');

      expect(mockRedisCall.fn).toHaveBeenCalledWith('INCR', 'rl:key');
      expect(result).toBe(7);
    });

    it('lança erro quando nenhum comando é informado', async () => {
      createRateLimiter();

      await expect(lastStore().options.sendCommand()).rejects.toThrow('Redis command is required');
      expect(mockRedisCall.fn).not.toHaveBeenCalled();
    });

    it('lança erro quando o comando é string vazia', async () => {
      createRateLimiter();

      await expect(lastStore().options.sendCommand('', 'x')).rejects.toThrow(
        'Redis command is required'
      );
      expect(mockRedisCall.fn).not.toHaveBeenCalled();
    });

    it('propaga erros do redis', async () => {
      mockRedisCall.fn = jest.fn().mockRejectedValue(new Error('redis down'));
      createRateLimiter();

      await expect(lastStore().options.sendCommand('GET', 'k')).rejects.toThrow('redis down');
    });
  });

  describe('singletons', () => {
    it('getRateLimiter retorna sempre a mesma instância com prefixo padrão', () => {
      const first = getRateLimiter();
      const storesAfterFirst = mockCreatedStores.length;
      const second = getRateLimiter();

      expect(first).toBe(second);
      expect(mockCreatedStores.length).toBe(storesAfterFirst);
      expect(rateLimiter).toBe(getRateLimiter);
    });

    it('getStrictRateLimiter usa limite e prefixo estritos', async () => {
      const limiter = getStrictRateLimiter();
      const store = lastStore();

      const response = await request(buildApp(limiter)).get('/test');

      expect(store.options.prefix).toBe(RATE_LIMIT_STRICT_KEY_PREFIX);
      expect(response.headers['ratelimit-limit']).toBe(String(RATE_LIMIT_STRICT_MAX_REQUESTS));
      expect(getStrictRateLimiter()).toBe(limiter);
      expect(strictRateLimiter).toBe(getStrictRateLimiter);
    });

    it('getAuthRateLimiter usa janela, limite, prefixo e mensagem de autenticação', async () => {
      const limiter = getAuthRateLimiter();
      const store = lastStore();
      const app = buildApp(limiter);

      let response = await request(app).get('/test');
      for (let i = 0; i < RATE_LIMIT_AUTH_MAX_REQUESTS; i += 1) {
        response = await request(app).get('/test');
      }

      expect(store.options.prefix).toBe(RATE_LIMIT_AUTH_KEY_PREFIX);
      expect(response.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(response.body.error.message).toBe(
        'Too many authentication attempts, please try again later'
      );
      expect(response.headers['ratelimit-policy']).toBe(
        `${RATE_LIMIT_AUTH_MAX_REQUESTS};w=${RATE_LIMIT_AUTH_WINDOW_MS / 1000}`
      );
      expect(getAuthRateLimiter()).toBe(limiter);
      expect(authRateLimiter).toBe(getAuthRateLimiter);
    });

    it('export default é createRateLimiter', () => {
      expect(createRateLimiterDefault).toBe(createRateLimiter);
    });
  });
});
