// Regressão: write-back obsoleto de `cache:blocks:<id>` depois da invalidação do bloqueio.
// A leitura de B começa (cache vazio → SELECT) ANTES de o bloqueio de A ser gravado; o evento
// apaga a chave; o SELECT antigo termina e grava `[]` por 300 s. O segundo DEL (1 s depois,
// disparado pelo listener) apaga esse `[]` e a leitura seguinte já vê o bloqueio.
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/modules/user/repositories', () => ({ contactRepository: {}, userRepository: {} }));

import { registerUserCacheListeners } from '@/modules/user/listeners';
import type { IContactRepository, IUserRepository } from '@/modules/user/interfaces';
import { ContactService } from '@/modules/user/services/ContactService';
import { CacheService } from '@/shared/cache';
import { EventBus } from '@/shared/event-bus/EventBus';
import { UserEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('ContactService + registerUserCacheListeners — write-back obsoleto dos bloqueios', () => {
  let redis: FakeRedis;
  let bus: EventBus;
  let unregister: () => void;

  beforeEach(() => {
    // Só os timers do segundo DEL são falsos; setImmediate/microtasks seguem reais.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    redis = new FakeRedis();
    unregister = registerUserCacheListeners(bus, new CacheService(redis));
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
    jest.useRealTimers();
  });

  it('um SELECT anterior ao bloqueio que grava [] depois do DEL é apagado pelo segundo DEL', async () => {
    let blocked = false;
    let releaseSelect!: () => void;
    const selectGate = new Promise<void>((resolve) => {
      releaseSelect = resolve;
    });
    const repository = {
      listBlockedEitherIds: jest.fn(async (): Promise<string[]> => {
        const snapshot = blocked ? [A] : []; // resultado lido antes do commit do bloqueio
        await selectGate;
        return snapshot;
      }),
    };
    const service = new ContactService(
      repository as unknown as IContactRepository,
      {} as IUserRepository,
      bus,
      new CacheService(redis)
    );

    const inFlight = service.isBlockedByEither(B, A); // B enviando para A: cache vazio → SELECT
    await new Promise((resolve) => setImmediate(resolve));
    blocked = true; // A bloqueia B (commit) …
    await bus.publish(UserEvents.BLOCKED, { userId: A, blockedUserId: B }); // … e o DEL
    releaseSelect();

    expect(await inFlight).toBe(false); // a leitura em voo é inevitavelmente antiga
    expect(await redis.get(`cache:blocks:${B}`)).toBe('[]'); // e gravou o valor antigo

    await jest.advanceTimersByTimeAsync(1000);

    expect(await redis.get(`cache:blocks:${B}`)).toBeNull();
    await expect(service.isBlockedByEither(B, A)).resolves.toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
