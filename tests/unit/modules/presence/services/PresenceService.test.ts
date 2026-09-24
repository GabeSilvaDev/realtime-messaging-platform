jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));

import type { PresenceRedisClient } from '@/modules/presence/types';
import { PresenceService, presenceService } from '@/modules/presence/services';
import { logger } from '@/shared/logger';
import { PresenceEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const TTL_MS = 30_000;
const LAST_SEEN = new Date('2026-09-26T09:00:00.000Z');

const conns = (userId: string): string => `presence:conns:${userId}`;
const manual = (userId: string): string => `presence:manual:${userId}`;

describe('PresenceService — conexões, status manual, estados e varredura', () => {
  let now: number;
  let redis: FakeRedis;
  let users: { getMultiple: jest.Mock; updateLastSeen: jest.Mock };
  let events: { publish: jest.Mock };
  let service: PresenceService;

  beforeEach(() => {
    now = Date.parse('2026-09-26T10:00:00.000Z');
    redis = new FakeRedis(() => now);
    users = {
      getMultiple: jest.fn().mockResolvedValue([]),
      updateLastSeen: jest.fn().mockResolvedValue(undefined),
    };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new PresenceService({ redis, users, events, now: () => now, sweepScanCount: 2 });
  });

  it('exporta a instância padrão (Redis e services da aplicação)', () => {
    expect(presenceService).toBeInstanceOf(PresenceService);
    expect(new PresenceService()).toBeInstanceOf(PresenceService);
  });

  describe('connect', () => {
    it('primeira conexão: ZADD com o instante, expiração da chave e presence:online', async () => {
      await expect(service.connect(ANA, 'node-a:s1')).resolves.toEqual({ becameOnline: true });

      expect(await redis.zscore(conns(ANA), 'node-a:s1')).toBe(String(now));
      expect(await redis.pttl(conns(ANA))).toBe(120_000);
      expect(events.publish).toHaveBeenCalledWith(PresenceEvents.ONLINE, {
        userId: ANA,
        timestamp: new Date(now),
      });
    });

    it('outra aba do mesmo usuário não publica de novo', async () => {
      await service.connect(ANA, 'node-a:s1');
      events.publish.mockClear();

      await expect(service.connect(ANA, 'node-b:s2')).resolves.toEqual({ becameOnline: false });
      expect(events.publish).not.toHaveBeenCalled();
      expect(await redis.zcard(conns(ANA))).toBe(2);
    });

    it('entrada vencida (nó que caiu) é removida e não conta como conexão', async () => {
      await redis.zadd(conns(ANA), now - TTL_MS - 1, 'dead-node:s0');

      await expect(service.connect(ANA, 'node-a:s1')).resolves.toEqual({ becameOnline: true });
      expect(await redis.zscore(conns(ANA), 'dead-node:s0')).toBeNull();
    });

    it('entrada com heartbeat há exatamente 30 s ainda vale', async () => {
      await redis.zadd(conns(ANA), now - TTL_MS, 'node-b:s0');

      await expect(service.connect(ANA, 'node-a:s1')).resolves.toEqual({ becameOnline: false });
    });
  });

  describe('heartbeat', () => {
    it('sem conexões não vai ao Redis', async () => {
      await service.heartbeat([]);

      expect(redis.commands).toEqual([]);
    });

    it('renova o score (e a expiração) só de quem ainda existe — ZADD XX', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.connect(BOB, 'node-a:s2');
      await service.disconnect(BOB, 'node-a:s2');
      now += 15_000;

      await service.heartbeat([
        { userId: ANA, connectionId: 'node-a:s1' },
        { userId: BOB, connectionId: 'node-a:s2' },
      ]);

      expect(await redis.zscore(conns(ANA), 'node-a:s1')).toBe(String(now));
      expect(await redis.pttl(conns(ANA))).toBe(120_000);
      expect(await redis.zcard(conns(BOB))).toBe(0);
    });
  });

  describe('disconnect', () => {
    it('última conexão: grava last_seen_at e publica presence:offline', async () => {
      await service.connect(ANA, 'node-a:s1');
      events.publish.mockClear();
      now += 5_000;

      const result = await service.disconnect(ANA, 'node-a:s1');

      expect(result).toEqual({ becameOffline: true, lastSeenAt: new Date(now) });
      expect(users.updateLastSeen).toHaveBeenCalledWith(ANA, new Date(now));
      expect(events.publish).toHaveBeenCalledWith(PresenceEvents.OFFLINE, {
        userId: ANA,
        lastSeen: new Date(now),
      });
      expect(redis.keys()).toEqual([]);
    });

    it('com outra aba conectada não fica offline', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.connect(ANA, 'node-a:s2');
      events.publish.mockClear();

      await expect(service.disconnect(ANA, 'node-a:s1')).resolves.toEqual({
        becameOffline: false,
      });
      expect(users.updateLastSeen).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('a outra "aba" vencida não segura o usuário online', async () => {
      await service.connect(ANA, 'node-a:s1');
      await redis.zadd(conns(ANA), now - TTL_MS - 1, 'dead-node:s0');

      await expect(service.disconnect(ANA, 'node-a:s1')).resolves.toMatchObject({
        becameOffline: true,
      });
    });

    it('entrada já removida pela varredura: nada a publicar', async () => {
      await expect(service.disconnect(ANA, 'node-a:s1')).resolves.toEqual({
        becameOffline: false,
      });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('falha ao gravar last_seen_at é logada e o offline sai mesmo assim', async () => {
      await service.connect(ANA, 'node-a:s1');
      users.updateLastSeen.mockRejectedValueOnce(new Error('pg down'));

      await service.disconnect(ANA, 'node-a:s1');

      expect(logger.error).toHaveBeenCalledWith(
        'Falha ao gravar last_seen_at na saída do usuário',
        expect.objectContaining({ message: 'pg down' }),
        { userId: ANA }
      );
      expect(events.publish).toHaveBeenCalledWith(
        PresenceEvents.OFFLINE,
        expect.objectContaining({ userId: ANA })
      );
    });

    it('rejeição que não é Error também é logada', async () => {
      await service.connect(ANA, 'node-a:s1');
      users.updateLastSeen.mockRejectedValueOnce('timeout');

      await service.disconnect(ANA, 'node-a:s1');

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'timeout' }),
        { userId: ANA }
      );
    });
  });

  describe('setManualStatus', () => {
    it('offline: grava o status sem mudar o estado (sem evento)', async () => {
      await expect(service.setManualStatus(ANA, 'busy')).resolves.toEqual({
        state: 'offline',
        changed: false,
      });
      expect(await redis.get(manual(ANA))).toBe('busy');
      expect(await redis.ttl(manual(ANA))).toBe(-1);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('conectado: available → busy publica presence:status-changed', async () => {
      await service.connect(ANA, 'node-a:s1');
      events.publish.mockClear();

      await expect(service.setManualStatus(ANA, 'busy')).resolves.toEqual({
        state: 'busy',
        changed: true,
      });
      expect(events.publish).toHaveBeenCalledWith(PresenceEvents.STATUS_CHANGED, {
        userId: ANA,
        status: 'busy',
      });
    });

    it('repetir o mesmo status não publica; voltar a available vira online', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.setManualStatus(ANA, 'away');
      events.publish.mockClear();

      await expect(service.setManualStatus(ANA, 'away')).resolves.toEqual({
        state: 'away',
        changed: false,
      });
      expect(events.publish).not.toHaveBeenCalled();
      await expect(service.setManualStatus(ANA, 'available')).resolves.toEqual({
        state: 'online',
        changed: true,
      });
    });

    it('valor desconhecido no Redis vale available', async () => {
      await service.connect(ANA, 'node-a:s1');
      await redis.set(manual(ANA), 'lixo');

      await expect(service.setManualStatus(ANA, 'available')).resolves.toEqual({
        state: 'online',
        changed: false,
      });
    });
  });

  describe('getStates', () => {
    it('lista vazia não vai ao Redis', async () => {
      await expect(service.getStates([])).resolves.toEqual(new Map());
      expect(redis.commands).toEqual([]);
    });

    it('efetivo por usuário; last_seen_at do Postgres só para os offline', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.connect(BOB, 'node-a:s2');
      await service.setManualStatus(BOB, 'busy');
      await redis.zadd(conns(CAROL), now - TTL_MS - 1, 'dead-node:s0');
      users.getMultiple.mockResolvedValue([{ id: CAROL, lastSeenAt: LAST_SEEN }]);

      const states = await service.getStates([ANA, BOB, CAROL, ANA, 'ghost']);

      expect(users.getMultiple).toHaveBeenCalledWith([CAROL, 'ghost']);
      expect([...states]).toEqual([
        [ANA, { state: 'online', lastSeenAt: null }],
        [BOB, { state: 'busy', lastSeenAt: null }],
        [CAROL, { state: 'offline', lastSeenAt: LAST_SEEN }],
        ['ghost', { state: 'offline', lastSeenAt: null }],
      ]);
    });

    it('status manual persiste entre reconexões', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.setManualStatus(ANA, 'away');
      await service.disconnect(ANA, 'node-a:s1');
      await service.connect(ANA, 'node-a:s9');

      expect((await service.getStates([ANA])).get(ANA)).toEqual({
        state: 'away',
        lastSeenAt: null,
      });
    });
  });

  describe('sweep', () => {
    it('percorre todas as chaves (SCAN em lotes) e só derruba quem ficou sem conexão', async () => {
      await redis.zadd(conns(ANA), now - TTL_MS - 1, 'dead:s1');
      await redis.zadd(conns(BOB), now - TTL_MS - 1, 'dead:s2', now, 'alive:s3');
      await redis.zadd(conns(CAROL), now, 'alive:s4');
      await redis.zadd(conns('dave'), now - TTL_MS - 5, 'dead:s5');
      await redis.set(manual(ANA), 'busy');

      const wentOffline = await service.sweep();

      expect(wentOffline.sort()).toEqual([ANA, 'dave'].sort());
      expect(users.updateLastSeen).toHaveBeenCalledWith(ANA, new Date(now));
      expect(events.publish).toHaveBeenCalledTimes(2);
      expect(events.publish).toHaveBeenCalledWith(PresenceEvents.OFFLINE, {
        userId: ANA,
        lastSeen: new Date(now),
      });
      expect(await redis.zcard(conns(BOB))).toBe(1);
      expect(await redis.zcard(conns(CAROL))).toBe(1);
      expect(await redis.get(manual(ANA))).toBe('busy');
    });

    it('duas varreduras (duas instâncias) não publicam o mesmo offline duas vezes', async () => {
      await redis.zadd(conns(ANA), now - TTL_MS - 1, 'dead:s1');

      await service.sweep();
      await service.sweep();

      expect(events.publish).toHaveBeenCalledTimes(1);
    });

    it('sem chaves de presença não publica nada', async () => {
      await expect(service.sweep()).resolves.toEqual([]);
    });
  });

  describe('falhas do Redis', () => {
    it('Redis fora do ar: a operação rejeita (quem chama loga)', async () => {
      redis.failWith = new Error('ECONNREFUSED');

      await expect(service.connect(ANA, 'node-a:s1')).rejects.toThrow('ECONNREFUSED');
    });

    it('erro de um comando do lote rejeita a operação', async () => {
      await redis.set(conns(ANA), 'não é um sorted set');

      await expect(service.connect(ANA, 'node-a:s1')).rejects.toThrow('WRONGTYPE');
    });

    it('lote abortado (exec → null) rejeita', async () => {
      const aborted = {
        multi: () => ({ exec: async () => null }),
      } as unknown as PresenceRedisClient;

      await expect(
        new PresenceService({ redis: aborted, users, events }).connect(ANA, 's1')
      ).rejects.toThrow('Lote do Redis abortado');
    });
  });
});
