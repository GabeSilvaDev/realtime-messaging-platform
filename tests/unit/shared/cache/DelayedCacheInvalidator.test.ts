jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/logger', () => ({ logger: { warn: jest.fn() } }));

import { CACHE_CONSTANTS, CacheService, DelayedCacheInvalidator } from '@/shared/cache';
import { logger } from '@/shared/logger';
import { FakeRedis } from '../../../support/redis/fakeRedis';

describe('DelayedCacheInvalidator', () => {
  let redis: FakeRedis;
  let invalidator: DelayedCacheInvalidator;

  beforeEach(async () => {
    jest.useFakeTimers();
    redis = new FakeRedis();
    invalidator = new DelayedCacheInvalidator(new CacheService(redis), 100);
    await redis.set('cache:a', '1');
    await redis.set('cache:b', '1');
  });

  afterEach(() => {
    invalidator.cancelPending();
    jest.useRealTimers();
  });

  it('apaga na hora e de novo depois do atraso (o que foi regravado no meio some)', async () => {
    await invalidator.forget(['a', 'b']);
    expect(redis.keys()).toEqual([]);

    await redis.set('cache:a', 'antigo'); // write-back de uma carga em voo
    await jest.advanceTimersByTimeAsync(99);
    expect(await redis.get('cache:a')).toBe('antigo');

    await jest.advanceTimersByTimeAsync(1);
    expect(redis.keys()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('aceita uma chave só; repetir a chave reinicia o timer dela (sem acumular)', async () => {
    const del = jest.spyOn(redis, 'del');

    await invalidator.forget('a');
    await jest.advanceTimersByTimeAsync(60);
    await invalidator.forget(['a', 'a']);
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(60);
    expect(del).toHaveBeenCalledTimes(2); // os dois DELs imediatos; o segundo foi adiado

    await jest.advanceTimersByTimeAsync(40);
    expect(del).toHaveBeenCalledTimes(3);
    expect(del).toHaveBeenLastCalledWith('cache:a');
  });

  it('lista vazia não faz nada', async () => {
    await invalidator.forget([]);

    expect(redis.keys()).toEqual(['cache:a', 'cache:b']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('o timer do segundo DEL não segura o processo (unref)', async () => {
    const unref = jest.fn();
    const timeout = jest
      .spyOn(global, 'setTimeout')
      .mockReturnValue({ unref } as unknown as NodeJS.Timeout);

    await invalidator.forget('a');

    expect(unref).toHaveBeenCalledTimes(1);
    timeout.mockRestore();
  });

  it('falha no segundo DEL vira log warn (nunca rejeição solta)', async () => {
    const cache = { del: jest.fn().mockResolvedValueOnce(undefined) };
    cache.del.mockRejectedValueOnce(new Error('ECONNRESET'));
    cache.del.mockRejectedValueOnce('texto');
    const failing = new DelayedCacheInvalidator(cache, 10);

    await failing.forget(['x', 'y']);
    await jest.advanceTimersByTimeAsync(10);

    expect(logger.warn).toHaveBeenCalledWith('Falha no segundo DEL do cache', {
      key: 'x',
      error: 'ECONNRESET',
    });
    expect(logger.warn).toHaveBeenCalledWith('Falha no segundo DEL do cache', {
      key: 'y',
      error: 'texto',
    });
  });

  it('cancelPending cancela os segundos DELs pendentes', async () => {
    await invalidator.forget(['a', 'b']);
    expect(jest.getTimerCount()).toBe(2);

    invalidator.cancelPending();

    expect(jest.getTimerCount()).toBe(0);
  });

  it('padrões: cache da aplicação e atraso de 1 s', () => {
    expect(CACHE_CONSTANTS.DELAYED_DELETE_MS).toBe(1000);
    expect(new DelayedCacheInvalidator()).toBeInstanceOf(DelayedCacheInvalidator);
  });
});
