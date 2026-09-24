jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { registerPresenceCacheListeners } from '@/modules/presence/listeners';
import { CacheService } from '@/shared/cache';
import { EventBus } from '@/shared/event-bus/EventBus';
import { ChatEvents, UserEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const audience = (userId: string): string => `cache:presence:audience:${userId}`;

describe('registerPresenceCacheListeners', () => {
  let bus: EventBus;
  let redis: FakeRedis;
  let unregister: () => void;

  beforeEach(async () => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    redis = new FakeRedis();
    unregister = registerPresenceCacheListeners(bus, new CacheService(redis));
    for (const userId of ['a', 'b', 'c']) {
      await redis.set(audience(userId), '[]');
    }
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  const remaining = (): string[] => redis.keys();

  it('bloqueio e desbloqueio apagam a audiência dos dois envolvidos', async () => {
    await bus.publish(UserEvents.BLOCKED, { userId: 'a', blockedUserId: 'b' });
    expect(remaining()).toEqual([audience('c')]);

    await redis.set(audience('a'), '[]');
    await bus.publish(UserEvents.UNBLOCKED, { userId: 'c', unblockedUserId: 'a' });
    expect(remaining()).toEqual([]);
  });

  it('contato adicionado/removido apaga a audiência de quem passou (ou deixou) de ser observado', async () => {
    await bus.publish(UserEvents.CONTACT_ADDED, { userId: 'a', contactId: 'b' });
    expect(remaining()).toEqual([audience('a'), audience('c')]);

    await bus.publish(UserEvents.CONTACT_REMOVED, { userId: 'a', contactId: 'c' });
    expect(remaining()).toEqual([audience('a')]);
  });

  it('conversa direct criada apaga a audiência dos dois; grupo não mexe', async () => {
    await bus.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: 'g1',
      type: 'group',
      creatorId: 'a',
      participantIds: ['a', 'b', 'c'],
    });
    expect(remaining()).toHaveLength(3);

    await bus.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: 'd1',
      type: 'direct',
      creatorId: 'a',
      participantIds: ['a', 'b'],
    });
    expect(remaining()).toEqual([audience('c')]);
  });

  describe('segundo DEL da audiência (write-back obsoleto)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('todo gatilho apaga a audiência de novo 1 s depois', async () => {
      await bus.publish(UserEvents.BLOCKED, { userId: 'a', blockedUserId: 'b' });
      await bus.publish(UserEvents.UNBLOCKED, { userId: 'a', unblockedUserId: 'b' });
      await bus.publish(UserEvents.CONTACT_ADDED, { userId: 'a', contactId: 'c' });
      await bus.publish(UserEvents.CONTACT_REMOVED, { userId: 'b', contactId: 'c' });
      await bus.publish(ChatEvents.CONVERSATION_CREATED, {
        conversationId: 'd1',
        type: 'direct',
        creatorId: 'a',
        participantIds: ['a', 'b'],
      });
      expect(jest.getTimerCount()).toBe(3); // um timer por chave (a, b, c), reiniciado
      // Cargas em voo gravam de volta audiências antigas depois do primeiro DEL.
      for (const userId of ['a', 'b', 'c']) {
        await redis.set(audience(userId), '["x"]');
      }

      await jest.advanceTimersByTimeAsync(999);
      expect(remaining()).toHaveLength(3);

      await jest.advanceTimersByTimeAsync(1);
      expect(remaining()).toEqual([]);
    });

    it('a função devolvida também cancela os segundos DELs pendentes; o atraso é injetável', async () => {
      await bus.publish(UserEvents.BLOCKED, { userId: 'a', blockedUserId: 'b' });
      expect(jest.getTimerCount()).toBe(2);
      unregister();
      expect(jest.getTimerCount()).toBe(0);

      unregister = registerPresenceCacheListeners(bus, new CacheService(redis), 10);
      await bus.publish(UserEvents.CONTACT_ADDED, { userId: 'a', contactId: 'c' });
      await redis.set(audience('c'), '["x"]');
      await jest.advanceTimersByTimeAsync(10);

      expect(await redis.get(audience('c'))).toBeNull();
    });
  });

  it('a função devolvida cancela as inscrições; o padrão usa o EventBus e o cache da aplicação', async () => {
    unregister();
    await bus.publish(UserEvents.BLOCKED, { userId: 'a', blockedUserId: 'b' });

    expect(remaining()).toHaveLength(3);
    expect(registerPresenceCacheListeners()).toBeInstanceOf(Function);
  });
});
