jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { registerUserCacheListeners } from '@/modules/user/listeners';
import { CacheService } from '@/shared/cache';
import { EventBus } from '@/shared/event-bus/EventBus';
import { UserEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

describe('registerUserCacheListeners', () => {
  let bus: EventBus;
  let redis: FakeRedis;
  let unregister: () => void;

  beforeEach(async () => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    redis = new FakeRedis();
    unregister = registerUserCacheListeners(bus, new CacheService(redis));
    for (const key of ['user:u1', 'user:u2', 'blocks:u1', 'blocks:u2', 'blocks:u3']) {
      await redis.set(`cache:${key}`, '[]');
    }
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  it('user:updated e user:deleted apagam o perfil público do usuário', async () => {
    await bus.publish(UserEvents.UPDATED, { userId: 'u1', fields: ['displayName'] });
    await bus.publish(UserEvents.DELETED, { userId: 'u2' });

    expect(redis.keys()).toEqual(['cache:blocks:u1', 'cache:blocks:u2', 'cache:blocks:u3']);
  });

  it('user:blocked e user:unblocked apagam o conjunto de bloqueios dos dois envolvidos', async () => {
    await bus.publish(UserEvents.BLOCKED, { userId: 'u1', blockedUserId: 'u2' });

    expect(redis.keys()).toEqual(['cache:blocks:u3', 'cache:user:u1', 'cache:user:u2']);

    await bus.publish(UserEvents.UNBLOCKED, { userId: 'u3', unblockedUserId: 'u1' });

    expect(redis.keys()).toEqual(['cache:user:u1', 'cache:user:u2']);
  });

  describe('segundo DEL dos bloqueios (write-back obsoleto)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('user:blocked e user:unblocked apagam de novo os bloqueios dos dois 1 s depois', async () => {
      await bus.publish(UserEvents.BLOCKED, { userId: 'u1', blockedUserId: 'u2' });
      await bus.publish(UserEvents.UNBLOCKED, { userId: 'u3', unblockedUserId: 'u1' });
      // Cargas em voo gravam de volta valores antigos depois do primeiro DEL.
      for (const key of ['blocks:u1', 'blocks:u2', 'blocks:u3']) {
        await redis.set(`cache:${key}`, '[]');
      }
      await bus.publish(UserEvents.UPDATED, { userId: 'u1', fields: ['bio'] });
      await redis.set('cache:user:u1', '{}');

      await jest.advanceTimersByTimeAsync(999);
      expect(redis.keys()).toHaveLength(5);

      await jest.advanceTimersByTimeAsync(1);
      // Só os bloqueios têm o segundo DEL; o perfil público fica com o DEL imediato.
      expect(redis.keys()).toEqual(['cache:user:u1', 'cache:user:u2']);
    });

    it('a função devolvida também cancela os segundos DELs pendentes', async () => {
      await bus.publish(UserEvents.BLOCKED, { userId: 'u1', blockedUserId: 'u2' });
      expect(jest.getTimerCount()).toBe(2);

      unregister();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('o atraso do segundo DEL é injetável', async () => {
      unregister();
      unregister = registerUserCacheListeners(bus, new CacheService(redis), 10);

      await bus.publish(UserEvents.BLOCKED, { userId: 'u1', blockedUserId: 'u2' });
      await redis.set('cache:blocks:u1', '[]');
      await jest.advanceTimersByTimeAsync(10);

      expect(await redis.get('cache:blocks:u1')).toBeNull();
    });
  });

  it('a invalidação termina antes de o publish resolver (subscriber síncrono)', async () => {
    const pending = bus.publish(UserEvents.BLOCKED, { userId: 'u1', blockedUserId: 'u2' });

    await pending;

    expect(await redis.get('cache:blocks:u1')).toBeNull();
  });

  it('a função devolvida cancela as inscrições; o padrão usa o EventBus e o cache da aplicação', async () => {
    unregister();
    await bus.publish(UserEvents.UPDATED, { userId: 'u1', fields: [] });

    expect(await redis.get('cache:user:u1')).toBe('[]');
    expect(registerUserCacheListeners()).toBeInstanceOf(Function);
  });
});
