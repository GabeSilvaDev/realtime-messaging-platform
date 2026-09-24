jest.mock('@/modules/chat/repositories', () => ({ participantRepository: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import type { IParticipantRepository } from '@/modules/chat/interfaces';
import { ParticipantDirectory } from '@/modules/chat/services/ParticipantDirectory';
import type { ParticipantAttributes } from '@/modules/chat/types';
import { CacheService } from '@/shared/cache';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

function participant(userId: string, role: 'admin' | 'member'): ParticipantAttributes {
  return {
    id: `p-${userId}`,
    conversationId: CONVERSATION_ID,
    userId,
    role,
    joinedAt: new Date('2026-09-24T10:00:00.000Z'),
    lastReadAt: new Date('2026-09-24T11:00:00.000Z'),
    isMuted: false,
    archivedAt: null,
  };
}

describe('ParticipantDirectory', () => {
  let participants: { listByConversation: jest.Mock };
  let redis: FakeRedis;
  let directory: ParticipantDirectory;

  beforeEach(() => {
    participants = {
      listByConversation: jest
        .fn()
        .mockResolvedValue([participant(USER_A, 'admin'), participant(USER_B, 'member')]),
    };
    redis = new FakeRedis();
    directory = new ParticipantDirectory(
      participants as unknown as IParticipantRepository,
      new CacheService(redis)
    );
  });

  it('guarda só ids e papéis, com TTL de 300 s', async () => {
    await expect(directory.list(CONVERSATION_ID)).resolves.toEqual([
      { userId: USER_A, role: 'admin' },
      { userId: USER_B, role: 'member' },
    ]);
    expect(JSON.parse((await redis.get(`cache:conv:participants:${CONVERSATION_ID}`))!)).toEqual([
      { userId: USER_A, role: 'admin' },
      { userId: USER_B, role: 'member' },
    ]);
    expect(await redis.ttl(`cache:conv:participants:${CONVERSATION_ID}`)).toBe(300);
  });

  it('userIds e isParticipant reaproveitam a mesma leitura', async () => {
    await expect(directory.userIds(CONVERSATION_ID)).resolves.toEqual([USER_A, USER_B]);
    await expect(directory.isParticipant(CONVERSATION_ID, USER_B)).resolves.toBe(true);
    await expect(directory.isParticipant(CONVERSATION_ID, USER_C)).resolves.toBe(false);

    expect(participants.listByConversation).toHaveBeenCalledTimes(1);
  });

  it('Redis fora do ar: lê do repositório a cada chamada (sem quebrar)', async () => {
    redis.failWith = new Error('ECONNREFUSED');

    await directory.userIds(CONVERSATION_ID);
    await directory.userIds(CONVERSATION_ID);

    expect(participants.listByConversation).toHaveBeenCalledTimes(2);
  });

  it('instância com dependências padrão', () => {
    expect(new ParticipantDirectory()).toBeInstanceOf(ParticipantDirectory);
  });
});
