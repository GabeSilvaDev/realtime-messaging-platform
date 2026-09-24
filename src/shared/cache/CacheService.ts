import { redis } from '../database/redis';
import { logger } from '../logger';
import { CACHE_CONSTANTS } from './cache.constants';
import type { CacheClient, ICacheService } from './cache.types';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Cache JSON sobre o Redis (chaves `cache:*`, TTL padrão de 300 s). O Redis é um acelerador,
 * nunca uma dependência: qualquer falha (conexão, timeout, valor corrompido) vira log `warn` e
 * o comportamento de "não estava no cache" — quem chamou segue com a fonte da verdade.
 *
 * Datas voltam como strings ISO (JSON): quem cacheia objetos com `Date` reconstrói os campos.
 */
export class CacheService implements ICacheService {
  constructor(
    private readonly client: CacheClient = redis,
    private readonly defaultTtlSeconds: number = CACHE_CONSTANTS.DEFAULT_TTL_SECONDS
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(this.key(key));
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.warn('get', error, { key });
      return null;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) {
      return [];
    }
    try {
      const raws = await this.client.mget(...keys.map((key) => this.key(key)));
      return raws.map((raw) => (raw === null ? null : (JSON.parse(raw) as T)));
    } catch (error) {
      this.warn('mget', error, { keys: keys.length });
      return keys.map(() => null);
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number = this.defaultTtlSeconds
  ): Promise<void> {
    try {
      await this.client.set(this.key(key), JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.warn('set', error, { key });
    }
  }

  async setMany(
    entries: [string, unknown][],
    ttlSeconds: number = this.defaultTtlSeconds
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    try {
      const results = await this.client
        .pipeline(
          entries.map(([key, value]) => [
            'set',
            this.key(key),
            JSON.stringify(value),
            'EX',
            ttlSeconds,
          ])
        )
        .exec();
      const failure = results
        ?.map(([error]) => error)
        .find((error): error is Error => error !== null);
      if (failure !== undefined) {
        throw failure;
      }
    } catch (error) {
      this.warn('setMany', error, { keys: entries.length });
    }
  }

  async del(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) {
      return;
    }
    try {
      await this.client.del(...list.map((key) => this.key(key)));
    } catch (error) {
      this.warn('del', error, { keys: list });
    }
  }

  async getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  private key(key: string): string {
    return `${CACHE_CONSTANTS.KEY_PREFIX}${key}`;
  }

  private warn(operation: string, error: unknown, context: Record<string, unknown>): void {
    logger.warn('Cache Redis indisponível; seguindo sem cache', {
      operation,
      ...context,
      error: describeError(error),
    });
  }
}

export const cacheService = new CacheService();
