jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/logger', () => ({ logger: { warn: jest.fn() } }));

import { CACHE_CONSTANTS, CacheService, cacheService, type CacheClient } from '@/shared/cache';
import { logger } from '@/shared/logger';
import { FakeRedis } from '../../../support/redis/fakeRedis';

describe('CacheService', () => {
  let now: number;
  let redis: FakeRedis;
  let cache: CacheService;

  beforeEach(() => {
    now = 1_000_000;
    redis = new FakeRedis(() => now);
    cache = new CacheService(redis);
  });

  it('exporta a instância padrão (Redis da aplicação) e as constantes', () => {
    expect(cacheService).toBeInstanceOf(CacheService);
    expect(CACHE_CONSTANTS).toEqual({ KEY_PREFIX: 'cache:', DEFAULT_TTL_SECONDS: 300 });
  });

  describe('get/set', () => {
    it('grava JSON com o prefixo cache: e TTL padrão de 300 s', async () => {
      await cache.set('user:1', { id: '1', tags: ['a'] });

      expect(await redis.get('cache:user:1')).toBe('{"id":"1","tags":["a"]}');
      expect(await redis.ttl('cache:user:1')).toBe(300);
      expect(await cache.get('user:1')).toEqual({ id: '1', tags: ['a'] });
    });

    it('TTL explícito no set e TTL padrão configurável no construtor', async () => {
      const shortLived = new CacheService(redis, 60);

      await cache.set('a', 1, 10);
      await shortLived.set('b', 2);

      expect(await redis.ttl('cache:a')).toBe(10);
      expect(await redis.ttl('cache:b')).toBe(60);
    });

    it('ausente ou expirado → null', async () => {
      await cache.set('k', 'v', 1);
      now += 1000;

      expect(await cache.get('k')).toBeNull();
      expect(await cache.get('nunca')).toBeNull();
    });
  });

  describe('mget/setMany', () => {
    it('mget devolve na ordem das chaves, null para ausentes', async () => {
      await cache.setMany([
        ['a', { n: 1 }],
        ['c', { n: 3 }],
      ]);

      expect(await cache.mget(['a', 'b', 'c'])).toEqual([{ n: 1 }, null, { n: 3 }]);
      expect(await redis.ttl('cache:c')).toBe(300);
    });

    it('setMany aceita TTL explícito', async () => {
      await cache.setMany([['a', 1]], 30);

      expect(await redis.ttl('cache:a')).toBe(30);
    });

    it('listas vazias não vão ao Redis', async () => {
      expect(await cache.mget([])).toEqual([]);
      await cache.setMany([]);
      await cache.del([]);

      expect(redis.commands).toEqual([]);
    });
  });

  describe('del', () => {
    it('apaga uma ou várias chaves (com o prefixo)', async () => {
      await cache.setMany([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      await cache.del('a');
      await cache.del(['b', 'c']);

      expect(redis.keys()).toEqual([]);
    });
  });

  describe('getOrLoad', () => {
    it('miss → chama o loader uma vez e cacheia; hit → não chama de novo', async () => {
      const loader = jest.fn().mockResolvedValue(['x', 'y']);

      expect(await cache.getOrLoad('list', 120, loader)).toEqual(['x', 'y']);
      expect(await cache.getOrLoad('list', 120, loader)).toEqual(['x', 'y']);

      expect(loader).toHaveBeenCalledTimes(1);
      expect(await redis.ttl('cache:list')).toBe(120);
    });

    it('erro do loader propaga e nada é cacheado', async () => {
      const loader = jest.fn().mockRejectedValue(new Error('db down'));

      await expect(cache.getOrLoad('list', 120, loader)).rejects.toThrow('db down');
      expect(redis.keys()).toEqual([]);
    });

    it('loader retorna undefined → devolve undefined mas não cacheia', async () => {
      const loader = jest.fn().mockResolvedValue(undefined);

      const result = await cache.getOrLoad('k', 120, loader);
      expect(result).toBeUndefined();
      expect(redis.keys()).toEqual([]);
    });
  });

  describe('undefined não é cacheado', () => {
    it('set com undefined não grava no Redis', async () => {
      await cache.set('k', undefined);

      expect(redis.keys()).toEqual([]);
    });

    it('setMany filtra undefined e não grava no Redis', async () => {
      await cache.setMany([
        ['a', 1],
        ['b', undefined],
        ['c', 3],
      ]);

      expect(redis.keys()).toEqual(['cache:a', 'cache:c']);
    });

    it('setMany com todos undefined não grava nada', async () => {
      await cache.setMany([
        ['a', undefined],
        ['b', undefined],
      ]);

      expect(redis.keys()).toEqual([]);
    });
  });

  describe('Redis indisponível → degrada para a fonte, com log warn', () => {
    beforeEach(() => {
      redis.failWith = new Error('ECONNREFUSED');
    });

    it('get/mget viram miss; set/setMany/del não lançam', async () => {
      expect(await cache.get('a')).toBeNull();
      expect(await cache.mget(['a', 'b'])).toEqual([null, null]);
      await expect(cache.set('a', 1)).resolves.toBeUndefined();
      await expect(cache.setMany([['a', 1]])).resolves.toBeUndefined();
      await expect(cache.del(['a'])).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledTimes(5);
      expect(logger.warn).toHaveBeenCalledWith('Cache Redis indisponível; seguindo sem cache', {
        operation: 'get',
        key: 'a',
        error: 'ECONNREFUSED',
      });
      expect(logger.warn).toHaveBeenCalledWith('Cache Redis indisponível; seguindo sem cache', {
        operation: 'del',
        keys: ['a'],
        error: 'ECONNREFUSED',
      });
    });

    it('getOrLoad responde com o loader', async () => {
      const loader = jest.fn().mockResolvedValue([1]);

      expect(await cache.getOrLoad('k', 60, loader)).toEqual([1]);
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('falhas parciais', () => {
    it('valor corrompido no Redis vira miss com warn distinto', async () => {
      await redis.set('cache:k', '{nao-e-json');

      expect(await cache.get('k')).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Valor inválido no cache; seguindo sem cache', {
        operation: 'get',
        key: 'k',
        error: expect.any(String),
      });
    });

    it('mget com item corrompido no meio devolve [valor, null, valor] com log distinto', async () => {
      await cache.setMany([
        ['a', { n: 1 }],
        ['c', { n: 3 }],
      ]);
      await redis.set('cache:b', '{corrupto');

      const result = await cache.mget(['a', 'b', 'c']);
      expect(result).toEqual([{ n: 1 }, null, { n: 3 }]);
      expect(logger.warn).toHaveBeenCalledWith('Valor inválido no cache; seguindo sem cache', {
        operation: 'mget',
        key: 'b',
        error: expect.any(String),
      });
    });

    it('erro de um comando do pipeline do setMany é logado', async () => {
      const client = {
        pipeline: () => ({
          exec: async () => [[new Error('OOM command not allowed'), undefined]],
        }),
      } as unknown as CacheClient;

      await new CacheService(client).setMany([['a', 1]]);

      expect(logger.warn).toHaveBeenCalledWith('Cache Redis indisponível; seguindo sem cache', {
        operation: 'setMany',
        keys: 1,
        error: 'OOM command not allowed',
      });
    });

    it('pipeline sem resultados (exec → null) não é tratado como erro', async () => {
      const client = {
        pipeline: () => ({ exec: async () => null }),
      } as unknown as CacheClient;

      await new CacheService(client).setMany([['a', 1]]);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('rejeição que não é Error também é descrita no log', async () => {
      const client = {
        get: () => Promise.reject(new Error('x')),
        mget: () => Promise.reject('timeout'),
      } as unknown as CacheClient;

      expect(await new CacheService(client).mget(['a'])).toEqual([null]);
      expect(logger.warn).toHaveBeenCalledWith('Cache Redis indisponível; seguindo sem cache', {
        operation: 'mget',
        keys: 1,
        error: 'timeout',
      });
    });
  });
});
