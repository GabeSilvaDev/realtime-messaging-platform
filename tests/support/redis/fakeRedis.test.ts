// Contrato do FakeRedis: os mesmos resultados que um Redis 7 real devolve para os comandos
// usados pelo cache e pela presença (conferido contra um Redis real na escrita do plano).
import { FakeRedis } from './fakeRedis';

describe('FakeRedis (contrato dos comandos usados)', () => {
  let now: number;
  let redis: FakeRedis;

  beforeEach(() => {
    now = 1_000_000;
    redis = new FakeRedis(() => now);
  });

  describe('strings', () => {
    it('GET/SET/MGET/DEL', async () => {
      expect(await redis.get('a')).toBeNull();
      expect(await redis.set('a', '1')).toBe('OK');
      await redis.set('b', '2');

      expect(await redis.get('a')).toBe('1');
      expect(await redis.mget('a', 'x', 'b')).toEqual(['1', null, '2']);
      expect(await redis.del('a', 'x')).toBe(1);
      expect(await redis.get('a')).toBeNull();
    });

    it('SET com EX expira pelo relógio; TTL/PTTL seguem o Redis (-2 sem chave, -1 sem expiração)', async () => {
      await redis.set('k', 'v', 'EX', 300);
      await redis.set('forever', 'v');

      expect(await redis.ttl('k')).toBe(300);
      expect(await redis.pttl('k')).toBe(300_000);
      expect(await redis.ttl('forever')).toBe(-1);
      expect(await redis.ttl('none')).toBe(-2);

      now += 299_999;
      expect(await redis.get('k')).toBe('v');
      now += 1;
      expect(await redis.get('k')).toBeNull();
      expect(await redis.ttl('k')).toBe(-2);
    });

    it('SET com PX também expira', async () => {
      await redis.set('k', 'v', 'PX', 50);
      now += 50;

      expect(await redis.get('k')).toBeNull();
    });

    it('GET/ZCARD no tipo errado respondem WRONGTYPE; MGET devolve null', async () => {
      await redis.zadd('z', 1, 'm');
      await redis.set('s', 'v');

      await expect(redis.get('z')).rejects.toThrow('WRONGTYPE');
      await expect(redis.zcard('s')).rejects.toThrow('WRONGTYPE');
      expect(await redis.mget('z')).toEqual([null]);
    });
  });

  describe('sorted sets', () => {
    it('ZADD devolve quantos membros são novos; ZADD XX só atualiza existentes', async () => {
      expect(await redis.zadd('z', 10, 'a', 20, 'b')).toBe(2);
      expect(await redis.zadd('z', 15, 'a')).toBe(0);
      expect(await redis.zadd('z', 'XX', 30, 'a', 40, 'c')).toBe(0);

      expect(await redis.zscore('z', 'a')).toBe('30');
      expect(await redis.zscore('z', 'c')).toBeNull();
      expect(await redis.zadd('missing', 'XX', 1, 'a')).toBe(0);
      expect(redis.keys()).toEqual(['z']);
    });

    it('ZCOUNT e ZREMRANGEBYSCORE aceitam -inf/+inf e limite exclusivo "("', async () => {
      await redis.zadd('z', 10, 'a', 20, 'b', 30, 'c');

      expect(await redis.zcount('z', '-inf', '+inf')).toBe(3);
      expect(await redis.zcount('z', 20, '+inf')).toBe(2);
      expect(await redis.zcount('z', '(20', '+inf')).toBe(1);
      expect(await redis.zcount('missing', '-inf', '+inf')).toBe(0);
      expect(await redis.zremrangebyscore('z', '-inf', '(20')).toBe(1);
      expect(await redis.zcard('z')).toBe(2);
      await expect(redis.zcount('z', 'x', '+inf')).rejects.toThrow('not a float');
    });

    it('ZREM e ZREMRANGEBYSCORE apagam o sorted set que fica vazio', async () => {
      await redis.zadd('z', 10, 'a');
      await redis.zadd('y', 10, 'a');

      expect(await redis.zrem('z', 'a', 'x')).toBe(1);
      expect(await redis.zremrangebyscore('y', '-inf', '+inf')).toBe(1);
      expect(await redis.zrem('missing', 'a')).toBe(0);
      expect(await redis.zremrangebyscore('missing', '-inf', '+inf')).toBe(0);
      expect(redis.keys()).toEqual([]);
    });

    it('PEXPIRE vale para o sorted set inteiro (0 quando a chave não existe)', async () => {
      await redis.zadd('z', 10, 'a');

      expect(await redis.pexpire('z', 1000)).toBe(1);
      expect(await redis.pexpire('missing', 1000)).toBe(0);
      expect(await redis.pttl('z')).toBe(1000);
      now += 1000;
      expect(await redis.zcard('z')).toBe(0);
    });
  });

  describe('SCAN', () => {
    it('percorre todas as chaves que casam com o MATCH, de COUNT em COUNT, até o cursor "0"', async () => {
      for (let i = 0; i < 5; i++) {
        await redis.zadd(`presence:conns:u${String(i)}`, 1, 'c');
      }
      await redis.set('presence:manual:u0', 'busy');

      const found: string[] = [];
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', 'presence:conns:*', 'COUNT', 2);
        found.push(...keys);
        cursor = next;
      } while (cursor !== '0');

      expect(found.sort()).toEqual([
        'presence:conns:u0',
        'presence:conns:u1',
        'presence:conns:u2',
        'presence:conns:u3',
        'presence:conns:u4',
      ]);
    });

    it('MATCH trata "?" como um caractere e o resto como literal', async () => {
      await redis.set('a.b', '1');
      await redis.set('axb', '1');
      await redis.set('ab', '1');

      expect((await redis.scan('0', 'MATCH', 'a.b', 'COUNT', 10))[1]).toEqual(['a.b']);
      expect((await redis.scan('0', 'MATCH', 'a?b', 'COUNT', 10))[1]).toEqual(['a.b', 'axb']);
    });
  });

  describe('pipeline/multi (formato de array do ioredis)', () => {
    it('devolve [erro, resultado] por comando, na ordem', async () => {
      await redis.set('s', 'v');

      const results = await redis
        .pipeline([
          ['set', 'k', 'v', 'EX', 10],
          ['get', 'k'],
          ['zcard', 's'],
        ])
        .exec();

      expect(results[0]).toEqual([null, 'OK']);
      expect(results[1]).toEqual([null, 'v']);
      expect(results[2]?.[0]?.message).toContain('WRONGTYPE');
      expect(results[2]?.[1]).toBeUndefined();
    });

    it('multi executa o lote inteiro sem intercalação', async () => {
      await redis.zadd('z', 1, 'old');

      const results = await redis
        .multi([
          ['zremrangebyscore', 'z', '-inf', '(5'],
          ['zcard', 'z'],
          ['zadd', 'z', 10, 'new'],
        ])
        .exec();

      expect(results).toEqual([
        [null, 1],
        [null, 0],
        [null, 1],
      ]);
    });

    it('comando desconhecido vira erro no resultado', async () => {
      const results = await redis.pipeline([['hset', 'h', 'f', 'v']]).exec();

      expect(results[0]?.[0]?.message).toContain('hset');
    });
  });

  describe('falha simulada e registro de comandos', () => {
    it('failWith faz todo comando (e o exec) rejeitar', async () => {
      redis.failWith = new Error('ECONNREFUSED');

      await expect(redis.get('a')).rejects.toThrow('ECONNREFUSED');
      await expect(redis.pipeline([['get', 'a']]).exec()).rejects.toThrow('ECONNREFUSED');
    });

    it('commands registra cada comando; flushall zera dados e registro', async () => {
      await redis.set('a', '1');
      await redis.multi([['get', 'a']]).exec();

      expect(redis.commands).toEqual(['set', 'get']);
      redis.flushall();
      expect(redis.commands).toEqual([]);
      expect(await redis.get('a')).toBeNull();
    });

    it('usa Date.now quando nenhum relógio é injetado', async () => {
      const real = new FakeRedis();
      await real.set('k', 'v', 'EX', 60);

      expect(await real.ttl('k')).toBe(60);
    });
  });
});
