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
