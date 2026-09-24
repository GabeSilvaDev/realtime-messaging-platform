jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { PresenceService } from '@/modules/presence/services';
import { CacheService } from '@/shared/cache';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';
const LAST_SEEN = new Date('2026-09-26T09:00:00.000Z');

describe('PresenceService — audiência, observados e visibilidade (bloqueios)', () => {
  let redis: FakeRedis;
  let cacheRedis: FakeRedis;
  let contacts: {
    listWatchers: jest.Mock;
    listContactIds: jest.Mock;
    listBlockedEitherIds: jest.Mock;
  };
  let conversations: { getDirectPartnerIds: jest.Mock };
  let users: { getMultiple: jest.Mock; updateLastSeen: jest.Mock };
  let service: PresenceService;

  beforeEach(() => {
    redis = new FakeRedis();
    cacheRedis = new FakeRedis();
    contacts = {
      listWatchers: jest.fn().mockResolvedValue([BOB, CAROL]),
      listContactIds: jest.fn().mockResolvedValue([BOB, DAVE]),
      listBlockedEitherIds: jest.fn().mockResolvedValue([CAROL]),
    };
    conversations = { getDirectPartnerIds: jest.fn().mockResolvedValue([BOB, DAVE, ANA]) };
    users = { getMultiple: jest.fn().mockResolvedValue([]), updateLastSeen: jest.fn() };
    service = new PresenceService({
      redis,
      users,
      contacts,
      conversations,
      events: { publish: jest.fn() },
      cache: new CacheService(cacheRedis),
    });
  });

  describe('presenceAudience', () => {
    it('quem tem o usuário como contato ∪ parceiros 1:1, menos bloqueios e ele mesmo', async () => {
      await expect(service.presenceAudience(ANA)).resolves.toEqual([BOB, DAVE]);

      expect(contacts.listWatchers).toHaveBeenCalledWith(ANA);
      expect(conversations.getDirectPartnerIds).toHaveBeenCalledWith(ANA);
      expect(contacts.listBlockedEitherIds).toHaveBeenCalledWith(ANA);
    });

    it('fica em cache:presence:audience:<id> por 300 s (segunda chamada sem consultas)', async () => {
      await service.presenceAudience(ANA);
      await service.presenceAudience(ANA);

      expect(contacts.listWatchers).toHaveBeenCalledTimes(1);
      expect(await cacheRedis.ttl(`cache:presence:audience:${ANA}`)).toBe(300);
    });
  });

  describe('watchedUserIds', () => {
    it('contatos do usuário ∪ parceiros 1:1, menos bloqueios e ele mesmo', async () => {
      await expect(service.watchedUserIds(ANA)).resolves.toEqual([BOB, DAVE]);
      expect(contacts.listContactIds).toHaveBeenCalledWith(ANA);
    });
  });

  describe('getVisibleStates', () => {
    it('par bloqueado sai offline sem lastSeenAt (e nem é consultado); demais, o estado real', async () => {
      await service.connect(BOB, 'node-a:s1');
      users.getMultiple.mockResolvedValue([{ id: DAVE, lastSeenAt: LAST_SEEN }]);

      const states = await service.getVisibleStates(ANA, [BOB, CAROL, DAVE, BOB]);

      expect(states).toEqual([
        { userId: BOB, state: 'online', lastSeenAt: null },
        { userId: CAROL, state: 'offline', lastSeenAt: null },
        { userId: DAVE, state: 'offline', lastSeenAt: LAST_SEEN },
      ]);
      expect(users.getMultiple).toHaveBeenCalledWith([DAVE]);
      expect(contacts.listBlockedEitherIds).toHaveBeenCalledWith(ANA);
    });
  });
});
