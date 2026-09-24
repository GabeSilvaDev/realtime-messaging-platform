// Redis em memória para os testes do cache e da presença. Não é arquivo de teste (não casa com
// testMatch). Implementa SÓ os comandos que o código usa, com a semântica do Redis 7 (validada
// contra um Redis real na escrita do plano): GET/SET (EX)/MGET/DEL, ZADD (XX)/ZREM/ZCOUNT/
// ZREMRANGEBYSCORE/ZCARD, PEXPIRE/TTL/PTTL, SCAN MATCH COUNT e pipeline/multi no formato de
// array do ioredis (`client.pipeline([['get', 'k'], ...]).exec()`).
//
// Os comandos rodam de forma síncrona por dentro (a Promise só embrulha o resultado): um
// `multi(...).exec()` é atômico como no Redis — nada se intercala entre os comandos do lote.
// O relógio é injetável (`clock`) para testar expiração sem esperar.

type Arg = string | number;

interface StringEntry {
  kind: 'string';
  value: string;
  expiresAt: number | null;
}

interface ZSetEntry {
  kind: 'zset';
  members: Map<string, number>;
  expiresAt: number | null;
}

type Entry = StringEntry | ZSetEntry;

export type ExecResult = [Error | null, unknown][];

export interface FakeBatch {
  exec(): Promise<ExecResult>;
}

const WRONGTYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';

/** Limite de score no formato do Redis: `-inf`, `+inf`, `123` (inclusivo) ou `(123` (exclusivo). */
function parseBound(raw: Arg): { value: number; exclusive: boolean } {
  const text = String(raw);
  const exclusive = text.startsWith('(');
  const body = exclusive ? text.slice(1) : text;
  if (body === '-inf') {
    return { value: -Infinity, exclusive };
  }
  if (body === '+inf' || body === 'inf') {
    return { value: Infinity, exclusive };
  }
  const value = Number(body);
  if (body === '' || Number.isNaN(value)) {
    throw new Error('ERR min or max is not a float');
  }
  return { value, exclusive };
}

function inRange(score: number, min: Arg, max: Arg): boolean {
  const low = parseBound(min);
  const high = parseBound(max);
  const aboveLow = low.exclusive ? score > low.value : score >= low.value;
  const belowHigh = high.exclusive ? score < high.value : score <= high.value;
  return aboveLow && belowHigh;
}

/** Glob do Redis para o MATCH do SCAN (`*`, `?` e literais). */
function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('')
    .map((char) => {
      if (char === '*') {
        return '.*';
      }
      if (char === '?') {
        return '.';
      }
      return char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`);
}

export class FakeRedis {
  private readonly data = new Map<string, Entry>();

  /** Quando preenchido, todo comando rejeita com este erro (simula o Redis fora do ar). */
  failWith: Error | null = null;

  /** Nome (minúsculo) de cada comando executado, na ordem — útil para contar idas ao Redis. */
  readonly commands: string[] = [];

  constructor(private readonly clock: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    return this.run('get', [key]) as string | null;
  }

  async set(key: string, value: string, ...options: Arg[]): Promise<'OK'> {
    return this.run('set', [key, value, ...options]) as 'OK';
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.run('mget', keys) as (string | null)[];
  }

  async del(...keys: string[]): Promise<number> {
    return this.run('del', keys) as number;
  }

  async zadd(key: string, ...args: Arg[]): Promise<number> {
    return this.run('zadd', [key, ...args]) as number;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.run('zrem', [key, ...members]) as number;
  }

  async zcount(key: string, min: Arg, max: Arg): Promise<number> {
    return this.run('zcount', [key, min, max]) as number;
  }

  async zremrangebyscore(key: string, min: Arg, max: Arg): Promise<number> {
    return this.run('zremrangebyscore', [key, min, max]) as number;
  }

  async zcard(key: string): Promise<number> {
    return this.run('zcard', [key]) as number;
  }

  async zscore(key: string, member: string): Promise<string | null> {
    return this.run('zscore', [key, member]) as string | null;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    return this.run('pexpire', [key, milliseconds]) as number;
  }

  async ttl(key: string): Promise<number> {
    return this.run('ttl', [key]) as number;
  }

  async pttl(key: string): Promise<number> {
    return this.run('pttl', [key]) as number;
  }

  async scan(
    cursor: Arg,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number
  ): Promise<[string, string[]]> {
    return this.run('scan', [cursor, matchToken, pattern, countToken, count]) as [string, string[]];
  }

  /** Lote sem atomicidade garantida no Redis real; aqui roda tudo de uma vez no `exec`. */
  pipeline(commands: Arg[][]): FakeBatch {
    return this.batch(commands);
  }

  /** MULTI/EXEC: o lote inteiro roda sem intercalação com outros comandos. */
  multi(commands: Arg[][]): FakeBatch {
    return this.batch(commands);
  }

  /** Chaves vivas (sem as expiradas), em ordem alfabética. */
  keys(): string[] {
    return [...this.data.keys()].filter((key) => this.entry(key) !== undefined).sort();
  }

  flushall(): void {
    this.data.clear();
    this.commands.length = 0;
  }

  private batch(commands: Arg[][]): FakeBatch {
    return {
      exec: async (): Promise<ExecResult> => {
        if (this.failWith !== null) {
          throw this.failWith;
        }
        return commands.map(([name, ...args]): [Error | null, unknown] => {
          try {
            return [null, this.execute(String(name).toLowerCase(), args)];
          } catch (error) {
            return [error as Error, undefined];
          }
        });
      },
    };
  }

  private run(name: string, args: Arg[]): unknown {
    if (this.failWith !== null) {
      throw this.failWith;
    }
    return this.execute(name, args);
  }

  /** Entrada viva da chave (remove a expirada, como o acesso preguiçoso do Redis). */
  private entry(key: string): Entry | undefined {
    const entry = this.data.get(key);
    if (entry?.expiresAt != null && entry.expiresAt <= this.clock()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  private zset(key: string): ZSetEntry | undefined {
    const entry = this.entry(key);
    if (entry !== undefined && entry.kind !== 'zset') {
      throw new Error(WRONGTYPE);
    }
    return entry;
  }

  private execute(name: string, args: Arg[]): unknown {
    this.commands.push(name);
    const [first] = args;
    const key = String(first);
    switch (name) {
      case 'get': {
        const entry = this.entry(key);
        if (entry !== undefined && entry.kind !== 'string') {
          throw new Error(WRONGTYPE);
        }
        return entry?.value ?? null;
      }
      case 'set': {
        const [, value, ...options] = args;
        let expiresAt: number | null = null;
        for (let i = 0; i < options.length; i++) {
          const option = String(options[i]).toUpperCase();
          if (option === 'EX' || option === 'PX') {
            const amount = Number(options[++i]);
            expiresAt = this.clock() + (option === 'EX' ? amount * 1000 : amount);
          }
        }
        this.data.set(key, { kind: 'string', value: String(value), expiresAt });
        return 'OK';
      }
      case 'mget':
        return args.map((k) => {
          const entry = this.entry(String(k));
          return entry?.kind === 'string' ? entry.value : null;
        });
      case 'del':
        return args.filter(
          (k) => this.entry(String(k)) !== undefined && this.data.delete(String(k))
        ).length;
      case 'zadd': {
        const rest = args.slice(1);
        const onlyExisting = String(rest[0]).toUpperCase() === 'XX';
        const pairs = onlyExisting ? rest.slice(1) : rest;
        let entry = this.zset(key);
        if (entry === undefined) {
          if (onlyExisting) {
            return 0;
          }
          entry = { kind: 'zset', members: new Map(), expiresAt: null };
          this.data.set(key, entry);
        }
        let added = 0;
        for (let i = 0; i < pairs.length; i += 2) {
          const member = String(pairs[i + 1]);
          const exists = entry.members.has(member);
          if (onlyExisting && !exists) {
            continue;
          }
          if (!exists) {
            added++;
          }
          entry.members.set(member, Number(pairs[i]));
        }
        return added;
      }
      case 'zrem': {
        const entry = this.zset(key);
        if (entry === undefined) {
          return 0;
        }
        const removed = args
          .slice(1)
          .filter((member) => entry.members.delete(String(member))).length;
        this.dropIfEmpty(key, entry);
        return removed;
      }
      case 'zcount': {
        const [, min = '-inf', max = '+inf'] = args;
        const entry = this.zset(key);
        return entry === undefined
          ? 0
          : [...entry.members.values()].filter((score) => inRange(score, min, max)).length;
      }
      case 'zremrangebyscore': {
        const [, min = '-inf', max = '+inf'] = args;
        const entry = this.zset(key);
        if (entry === undefined) {
          return 0;
        }
        let removed = 0;
        for (const [member, score] of entry.members) {
          if (inRange(score, min, max)) {
            entry.members.delete(member);
            removed++;
          }
        }
        this.dropIfEmpty(key, entry);
        return removed;
      }
      case 'zcard':
        return this.zset(key)?.members.size ?? 0;
      case 'zscore': {
        const score = this.zset(key)?.members.get(String(args[1]));
        return score === undefined ? null : String(score);
      }
      case 'pexpire': {
        const entry = this.entry(key);
        if (entry === undefined) {
          return 0;
        }
        entry.expiresAt = this.clock() + Number(args[1]);
        return 1;
      }
      case 'ttl':
      case 'pttl': {
        const entry = this.entry(key);
        if (entry === undefined) {
          return -2;
        }
        if (entry.expiresAt === null) {
          return -1;
        }
        const remaining = entry.expiresAt - this.clock();
        return name === 'ttl' ? Math.round(remaining / 1000) : remaining;
      }
      case 'scan': {
        const pattern = globToRegExp(String(args[2]));
        const count = Number(args[4]);
        const all = this.keys();
        const start = Number(first);
        const end = start + count;
        const next = end >= all.length ? '0' : String(end);
        return [next, all.slice(start, end).filter((k) => pattern.test(k))];
      }
      default:
        throw new Error(`ERR comando não suportado pelo FakeRedis: ${name}`);
    }
  }

  /** O Redis apaga o sorted set que fica vazio. */
  private dropIfEmpty(key: string, entry: ZSetEntry): void {
    if (entry.members.size === 0) {
      this.data.delete(key);
    }
  }
}
