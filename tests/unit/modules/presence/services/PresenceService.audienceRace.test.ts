// Regressão: write-back obsoleto de `cache:presence:audience:<id>` depois da invalidação do
// bloqueio. A ponte carrega a audiência de A (cache vazio → consultas) ANTES de o bloqueio ser
// gravado; o evento apaga a chave; o loader antigo termina e grava a audiência com B por 300 s.
// O segundo DEL (1 s depois) apaga esse valor e a próxima carga já exclui B.
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { registerPresenceCacheListeners } from '@/modules/presence/listeners';
import { PresenceService } from '@/modules/presence/services';
import { CacheService } from '@/shared/cache';
import { EventBus } from '@/shared/event-bus/EventBus';
import { UserEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const AUDIENCE = `cache:presence:audience:${A}`;

describe('PresenceService + registerPresenceCacheListeners — write-back obsoleto da audiência', () => {
  let cacheRedis: FakeRedis;
  let bus: EventBus;
  let unregister: () => void;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    cacheRedis = new FakeRedis();
    unregister = registerPresenceCacheListeners(bus, new CacheService(cacheRedis));
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
    jest.useRealTimers();
  });

  it('uma carga anterior ao bloqueio gravada depois do DEL é apagada pelo segundo DEL', async () => {
    let blocked = false;
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const contacts = {
      listWatchers: jest.fn().mockResolvedValue([B]),
      listContactIds: jest.fn().mockResolvedValue([]),
      listBlockedEitherIds: jest.fn(async (): Promise<string[]> => {
        const snapshot = blocked ? [B] : [];
        await loadGate;
        return snapshot;
      }),
    };
    const service = new PresenceService({
      redis: new FakeRedis(),
      users: { getMultiple: jest.fn(), updateLastSeen: jest.fn() },
      contacts,
      conversations: { getDirectPartnerIds: jest.fn().mockResolvedValue([]) },
      events: { publish: jest.fn() },
      cache: new CacheService(cacheRedis),
    });

    const inFlight = service.presenceAudience(A);
    await new Promise((resolve) => setImmediate(resolve));
    blocked = true;
    await bus.publish(UserEvents.BLOCKED, { userId: A, blockedUserId: B });
    releaseLoad();

    expect(await inFlight).toEqual([B]);
    expect(JSON.parse((await cacheRedis.get(AUDIENCE))!)).toEqual([B]);

    await jest.advanceTimersByTimeAsync(1000);

    expect(await cacheRedis.get(AUDIENCE)).toBeNull();
    await expect(service.presenceAudience(A)).resolves.toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
