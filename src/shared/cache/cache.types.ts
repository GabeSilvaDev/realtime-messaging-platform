/** Um comando no formato de array do ioredis: `['set', 'chave', 'valor', 'EX', 300]`. */
export type RedisCommand = (string | number)[];

/** Lote (`pipeline`/`multi`): `exec` devolve `[erro, resultado]` por comando, na ordem. */
export interface RedisBatch {
  exec(): Promise<[Error | null, unknown][] | null>;
}

/** Os comandos do Redis que o cache usa (o `Redis` do ioredis satisfaz esta interface). */
export interface CacheClient {
  get(key: string): Promise<string | null>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, secondsToken: 'EX', seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  pipeline(commands: RedisCommand[]): RedisBatch;
}

/**
 * Cache JSON sobre o Redis. Toda chave recebe o prefixo `cache:`; toda falha do Redis degrada
 * para "sem cache" (log `warn`) e nunca quebra quem chamou. `null` não é cacheável (é o valor
 * de "não está no cache").
 */
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  /** Na ordem de `keys`; `null` para ausentes (ou para todas, se o Redis falhar). */
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  /** Grava várias chaves num único pipeline, todas com o mesmo TTL. */
  setMany(entries: [string, unknown][], ttlSeconds?: number): Promise<void>;
  del(keys: string | string[]): Promise<void>;
  /** Devolve o valor cacheado ou chama `loader`, grava o resultado com o TTL e o devolve. */
  getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
}
