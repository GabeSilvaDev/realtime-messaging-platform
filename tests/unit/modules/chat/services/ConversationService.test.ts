jest.mock('@/modules/chat/repositories', () => ({
  conversationRepository: {},
  participantRepository: {},
}));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import {
  CannotConverseWithSelfException,
  ConversationBlockedException,
  ConversationNotFoundException,
  GroupOnlyOperationException,
  GroupParticipantLimitException,
  NotConversationAdminException,
  ParticipantNotFoundException,
  UsersNotFoundException,
} from '@/modules/chat/errors';
import type { IConversationRepository, IParticipantRepository } from '@/modules/chat/interfaces';
import { ParticipantDirectory } from '@/modules/chat/services/ParticipantDirectory';
import { CacheService } from '@/shared/cache';
import { FakeRedis } from '../../../../support/redis/fakeRedis';
import {
  ConversationService,
  buildDirectKey,
  conversationService,
} from '@/modules/chat/services/ConversationService';
import type {
  ChatTransaction,
  ConversationAttributes,
  ParticipantAttributes,
  ParticipantRole,
} from '@/modules/chat/types';
import type { PublicUserDTO } from '@/modules/user/types';
import { ChatEvents } from '@/shared/types';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const USER_D = '44444444-4444-4444-8444-444444444444';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-09-24T10:00:00.000Z');

/** Transação falsa: o lock é do repositório; o service só a repassa. */
const TX = { id: 'tx' } as unknown as ChatTransaction;

function conversation(overrides: Partial<ConversationAttributes> = {}): ConversationAttributes {
  return {
    id: CONVERSATION_ID,
    type: 'group',
    name: 'Time',
    avatarUrl: null,
    createdBy: USER_A,
    directKey: null,
    lastMessageAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function participant(
  userId: string,
  role: ParticipantRole = 'member',
  overrides: Partial<ParticipantAttributes> = {}
): ParticipantAttributes {
  return {
    id: `p-${userId}`,
    conversationId: CONVERSATION_ID,
    userId,
    role,
    joinedAt: NOW,
    lastReadAt: null,
    isMuted: false,
    archivedAt: null,
    ...overrides,
  };
}

function user(id: string, username: string): PublicUserDTO {
  return { id, username, displayName: null, avatarUrl: null, status: 'offline', lastSeenAt: null };
}

describe('ConversationService', () => {
  let conversations: jest.Mocked<IConversationRepository>;
  let participants: jest.Mocked<IParticipantRepository>;
  let users: { exists: jest.Mock; getMultiple: jest.Mock };
  let contacts: { isBlockedByEither: jest.Mock };
  let events: { publish: jest.Mock };
  let service: ConversationService;

  /** Configura o repositório para que `get(userId, CONVERSATION_ID)` funcione. */
  function givenMembership(
    conv: ConversationAttributes,
    members: ParticipantAttributes[],
    knownUsers: PublicUserDTO[] = []
  ): void {
    participants.find.mockImplementation(
      async (_conversationId: string, userId: string) =>
        members.find((m) => m.userId === userId) ?? null
    );
    conversations.findById.mockResolvedValue(conv);
    participants.listByConversation.mockResolvedValue(members);
    users.getMultiple.mockResolvedValue(knownUsers);
  }

  beforeEach(() => {
    conversations = {
      findById: jest.fn(),
      findByDirectKey: jest.fn(),
      createDirect: jest.fn(),
      createGroup: jest.fn(),
      listForUser: jest.fn(),
      rename: jest.fn(),
      touchLastMessageAt: jest.fn(),
      delete: jest.fn(),
      withLock: jest.fn(),
    };
    participants = {
      find: jest.fn(),
      listByConversation: jest.fn(),
      listByConversations: jest.fn(),
      listConversationIdsByUser: jest.fn(),
      listDirectPartnerIds: jest.fn(),
      addMembers: jest.fn(),
      remove: jest.fn(),
      setRole: jest.fn(),
      setArchivedAt: jest.fn(),
      advanceLastReadAt: jest.fn(),
    };
    users = { exists: jest.fn(), getMultiple: jest.fn() };
    contacts = { isBlockedByEither: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    conversations.withLock.mockImplementation(async (_id, work) => work(TX));
    service = new ConversationService(
      conversations,
      participants,
      users,
      contacts,
      events,
      new ParticipantDirectory(participants, new CacheService(new FakeRedis()))
    );
  });

  it('deve exportar a instância padrão', () => {
    expect(conversationService).toBeInstanceOf(ConversationService);
  });

  describe('buildDirectKey', () => {
    it('deve ordenar os ids para que a chave independa de quem iniciou', () => {
      expect(buildDirectKey(USER_B, USER_A)).toBe(`${USER_A}:${USER_B}`);
      expect(buildDirectKey(USER_A, USER_B)).toBe(`${USER_A}:${USER_B}`);
    });
  });

  describe('createDirect', () => {
    const direct = conversation({ type: 'direct', name: null, directKey: `${USER_A}:${USER_B}` });

    it('deve lançar 400 ao conversar consigo mesmo', async () => {
      await expect(service.createDirect(USER_A, USER_A)).rejects.toThrow(
        CannotConverseWithSelfException
      );
    });

    it('deve lançar 404 quando o outro usuário não existe', async () => {
      users.exists.mockResolvedValue(false);

      await expect(service.createDirect(USER_A, USER_B)).rejects.toThrow(UsersNotFoundException);
    });

    it('deve lançar 403 quando há bloqueio em qualquer sentido', async () => {
      users.exists.mockResolvedValue(true);
      contacts.isBlockedByEither.mockResolvedValue(true);

      await expect(service.createDirect(USER_A, USER_B)).rejects.toThrow(
        ConversationBlockedException
      );
      expect(contacts.isBlockedByEither).toHaveBeenCalledWith(USER_A, USER_B);
    });

    it('deve retornar a conversa existente com created=false (idempotente)', async () => {
      users.exists.mockResolvedValue(true);
      contacts.isBlockedByEither.mockResolvedValue(false);
      conversations.findByDirectKey.mockResolvedValue(direct);
      givenMembership(
        direct,
        [participant(USER_A), participant(USER_B)],
        [user(USER_A, 'ana'), user(USER_B, 'bob')]
      );

      const result = await service.createDirect(USER_B, USER_A);

      expect(conversations.findByDirectKey).toHaveBeenCalledWith(`${USER_A}:${USER_B}`);
      expect(conversations.createDirect).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.conversation.id).toBe(CONVERSATION_ID);
    });

    it('deve criar a conversa e publicar CONVERSATION_CREATED', async () => {
      users.exists.mockResolvedValue(true);
      contacts.isBlockedByEither.mockResolvedValue(false);
      conversations.findByDirectKey.mockResolvedValue(null);
      conversations.createDirect.mockResolvedValue({ conversation: direct, created: true });
      givenMembership(
        direct,
        [participant(USER_A), participant(USER_B)],
        [user(USER_A, 'ana'), user(USER_B, 'bob')]
      );

      const result = await service.createDirect(USER_A, USER_B);

      expect(conversations.createDirect).toHaveBeenCalledWith({
        directKey: `${USER_A}:${USER_B}`,
        createdBy: USER_A,
        userIds: [USER_A, USER_B],
      });
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_CREATED, {
        conversationId: CONVERSATION_ID,
        type: 'direct',
        creatorId: USER_A,
        participantIds: [USER_A, USER_B],
      });
      expect(result.created).toBe(true);
      expect(result.conversation.participants.map((p) => p.username)).toEqual(['ana', 'bob']);
    });

    it('não deve publicar quando a criação perdeu a corrida (created=false)', async () => {
      users.exists.mockResolvedValue(true);
      contacts.isBlockedByEither.mockResolvedValue(false);
      conversations.findByDirectKey.mockResolvedValue(null);
      conversations.createDirect.mockResolvedValue({ conversation: direct, created: false });
      givenMembership(direct, [participant(USER_A), participant(USER_B)]);

      const result = await service.createDirect(USER_A, USER_B);

      expect(events.publish).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
    });
  });

  describe('createGroup', () => {
    it('deve deduplicar, remover o criador, criar e publicar', async () => {
      const group = conversation();
      users.getMultiple.mockResolvedValueOnce([user(USER_B, 'bob'), user(USER_C, 'carol')]);
      conversations.createGroup.mockResolvedValue(group);
      givenMembership(
        group,
        [participant(USER_A, 'admin'), participant(USER_B), participant(USER_C)],
        [user(USER_A, 'ana'), user(USER_B, 'bob'), user(USER_C, 'carol')]
      );

      const result = await service.createGroup(USER_A, {
        name: 'Time',
        participantIds: [USER_B, USER_C, USER_B, USER_A],
      });

      expect(conversations.createGroup).toHaveBeenCalledWith({
        name: 'Time',
        createdBy: USER_A,
        memberIds: [USER_B, USER_C],
      });
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_CREATED, {
        conversationId: CONVERSATION_ID,
        type: 'group',
        creatorId: USER_A,
        participantIds: [USER_A, USER_B, USER_C],
      });
      expect(result.membership.role).toBe('admin');
    });

    it('deve lançar 404 listando os usuários ausentes', async () => {
      users.getMultiple.mockResolvedValue([user(USER_B, 'bob')]);

      const promise = service.createGroup(USER_A, {
        name: 'Time',
        participantIds: [USER_B, USER_C, USER_D],
      });

      await expect(promise).rejects.toThrow(UsersNotFoundException);
      await expect(promise).rejects.toMatchObject({
        details: [
          expect.objectContaining({ message: USER_C }),
          expect.objectContaining({ message: USER_D }),
        ],
      });
      expect(conversations.createGroup).not.toHaveBeenCalled();
    });

    it('deve lançar 400 acima de 256 participantes (incluindo o criador)', async () => {
      const many = Array.from(
        { length: 256 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      );

      await expect(
        service.createGroup(USER_A, { name: 'Time', participantIds: many })
      ).rejects.toThrow(GroupParticipantLimitException);
      expect(users.getMultiple).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('deve paginar e montar participantes por conversa', async () => {
      const other = conversation({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Outro' });
      conversations.listForUser.mockResolvedValue({
        total: 3,
        rows: [
          { conversation: conversation(), membership: participant(USER_A, 'admin') },
          { conversation: other, membership: participant(USER_A, 'member', { isMuted: true }) },
        ],
      });
      participants.listByConversations.mockResolvedValue([
        participant(USER_A, 'admin'),
        participant(USER_B),
        participant(USER_A, 'member', { conversationId: other.id }),
      ]);
      users.getMultiple.mockResolvedValue([user(USER_A, 'ana'), user(USER_B, 'bob')]);

      const result = await service.list(USER_A, { limit: 2, offset: 0 });

      expect(conversations.listForUser).toHaveBeenCalledWith(USER_A, {
        archived: false,
        limit: 2,
        offset: 0,
      });
      expect(participants.listByConversations).toHaveBeenCalledWith([CONVERSATION_ID, other.id]);
      expect(users.getMultiple).toHaveBeenCalledWith([USER_A, USER_B]);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
      expect(result.items[0]!.participants.map((p) => p.username)).toEqual(['ana', 'bob']);
      expect(result.items[1]!.participants).toEqual([
        { id: USER_A, username: 'ana', displayName: null, avatarUrl: null, role: 'member' },
      ]);
      expect(result.items[1]!.membership).toEqual({
        role: 'member',
        isMuted: true,
        archivedAt: null,
      });
    });

    it('deve montar participantes por conversa via mapas, sem vazar entre conversas (múltiplas conversas/usuários)', async () => {
      const convB = conversation({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'B' });
      const convC = conversation({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'C' });
      conversations.listForUser.mockResolvedValue({
        total: 3,
        rows: [
          { conversation: conversation(), membership: participant(USER_A, 'admin') },
          { conversation: convB, membership: participant(USER_A) },
          { conversation: convC, membership: participant(USER_A) },
        ],
      });
      participants.listByConversations.mockResolvedValue([
        participant(USER_A, 'admin'),
        participant(USER_B, 'member', { conversationId: convB.id }),
        participant(USER_A, 'member', { conversationId: convB.id }),
        participant(USER_D, 'member', { conversationId: convC.id }),
      ]);
      users.getMultiple.mockResolvedValue([user(USER_A, 'ana'), user(USER_B, 'bob')]);

      const result = await service.list(USER_A);

      expect(result.items[0]!.participants.map((p) => p.username)).toEqual(['ana']);
      expect(result.items[1]!.participants.map((p) => p.username)).toEqual(['bob', 'ana']);
      // USER_D não veio em users.getMultiple (usuário removido/ausente) — omitido, sem
      // vazar participantes de outras conversas para dentro de convC.
      expect(result.items[2]!.participants).toEqual([]);
    });

    it('deve devolver participantes vazios quando a conversa não tem entrada no mapa', async () => {
      const orphan = conversation({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Órfã' });
      conversations.listForUser.mockResolvedValue({
        total: 1,
        rows: [{ conversation: orphan, membership: participant(USER_A) }],
      });
      participants.listByConversations.mockResolvedValue([]);
      users.getMultiple.mockResolvedValue([]);

      const result = await service.list(USER_A);

      expect(result.items[0]!.participants).toEqual([]);
    });

    it('deve usar defaults (archived=false, limit=20, offset=0) e limitar a 100', async () => {
      conversations.listForUser.mockResolvedValue({ total: 0, rows: [] });
      participants.listByConversations.mockResolvedValue([]);
      users.getMultiple.mockResolvedValue([]);

      const defaults = await service.list(USER_A);
      await service.list(USER_A, { archived: true, limit: 500, offset: 40 });

      expect(conversations.listForUser).toHaveBeenNthCalledWith(1, USER_A, {
        archived: false,
        limit: 20,
        offset: 0,
      });
      expect(conversations.listForUser).toHaveBeenNthCalledWith(2, USER_A, {
        archived: true,
        limit: 100,
        offset: 40,
      });
      expect(defaults).toEqual({ items: [], total: 0, limit: 20, offset: 0, hasMore: false });
    });
  });

  describe('get', () => {
    it('deve responder 404 para não participante (não revela existência)', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.get(USER_D, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
      expect(conversations.findById).not.toHaveBeenCalled();
    });

    it('deve responder 404 quando a conversa sumiu', async () => {
      participants.find.mockResolvedValue(participant(USER_A));
      conversations.findById.mockResolvedValue(null);

      await expect(service.get(USER_A, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });

    it('deve omitir participantes cujo usuário não foi encontrado', async () => {
      givenMembership(
        conversation(),
        [participant(USER_A, 'admin'), participant(USER_B)],
        [user(USER_A, 'ana')]
      );

      const result = await service.get(USER_A, CONVERSATION_ID);

      expect(result.participants).toEqual([
        { id: USER_A, username: 'ana', displayName: null, avatarUrl: null, role: 'admin' },
      ]);
      expect(result).not.toHaveProperty('directKey');
    });
  });

  describe('rename', () => {
    it('deve renomear (admin de grupo) e publicar renamed', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await service.rename(USER_A, CONVERSATION_ID, 'Novo nome');

      expect(conversations.rename).toHaveBeenCalledWith(CONVERSATION_ID, 'Novo nome');
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'renamed',
        actorId: USER_A,
        participantIds: [USER_A, USER_B],
        affectedUserIds: [],
        name: 'Novo nome',
      });
    });

    it('deve responder 400 em conversa direct', async () => {
      givenMembership(conversation({ type: 'direct' }), [participant(USER_A), participant(USER_B)]);

      await expect(service.rename(USER_A, CONVERSATION_ID, 'x')).rejects.toThrow(
        GroupOnlyOperationException
      );
    });

    it('deve responder 403 para membro não admin', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await expect(service.rename(USER_B, CONVERSATION_ID, 'x')).rejects.toThrow(
        NotConversationAdminException
      );
      expect(conversations.rename).not.toHaveBeenCalled();
    });
  });

  describe('archive / unarchive', () => {
    it('deve arquivar e desarquivar apenas para o participante', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);

      await service.archive(USER_A, CONVERSATION_ID);
      await service.unarchive(USER_A, CONVERSATION_ID);

      expect(participants.setArchivedAt).toHaveBeenNthCalledWith(
        1,
        CONVERSATION_ID,
        USER_A,
        expect.any(Date)
      );
      expect(participants.setArchivedAt).toHaveBeenNthCalledWith(2, CONVERSATION_ID, USER_A, null);
    });

    it('deve responder 404 para não participante', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.archive(USER_D, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });
  });

  describe('leave', () => {
    it('deve responder 400 em conversa direct', async () => {
      givenMembership(conversation({ type: 'direct' }), [participant(USER_A), participant(USER_B)]);

      await expect(service.leave(USER_A, CONVERSATION_ID)).rejects.toThrow(
        GroupOnlyOperationException
      );
      expect(participants.remove).not.toHaveBeenCalled();
    });

    it('roda tudo dentro do lock da conversa (mesma transação) e publica só depois', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_B)]);
      conversations.withLock.mockImplementation(async (_id, work) => {
        const result = await work(TX);
        expect(events.publish).not.toHaveBeenCalled();
        return result;
      });

      await service.leave(USER_A, CONVERSATION_ID);

      expect(conversations.withLock).toHaveBeenCalledWith(CONVERSATION_ID, expect.any(Function));
      expect(participants.find).toHaveBeenCalledWith(CONVERSATION_ID, USER_A, TX);
      expect(conversations.findById).toHaveBeenCalledWith(CONVERSATION_ID, TX);
      expect(participants.listByConversation).toHaveBeenCalledWith(CONVERSATION_ID, TX);
      expect(events.publish).toHaveBeenCalledTimes(1);
    });

    it('último admin saindo promove o membro mais antigo', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_B), participant(USER_C)]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_A, TX);
      expect(participants.setRole).toHaveBeenCalledWith(CONVERSATION_ID, USER_B, 'admin', TX);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'member_left',
        actorId: USER_A,
        participantIds: [USER_A, USER_B, USER_C],
        affectedUserIds: [USER_A],
      });
    });

    it('não promove ninguém quando ainda resta admin', async () => {
      givenMembership(conversation(), [participant(USER_A), participant(USER_B, 'admin')]);
      participants.listByConversation.mockResolvedValue([participant(USER_B, 'admin')]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(participants.setRole).not.toHaveBeenCalled();
    });

    it('remove a conversa e publica CONVERSATION_DELETED (não member_left) quando não resta ninguém', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);
      participants.listByConversation.mockResolvedValue([]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(conversations.delete).toHaveBeenCalledWith(CONVERSATION_ID, TX);
      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_DELETED, {
        conversationId: CONVERSATION_ID,
        actorId: USER_A,
        participantIds: [USER_A],
      });
      expect(events.publish).not.toHaveBeenCalledWith(
        ChatEvents.CONVERSATION_UPDATED,
        expect.anything()
      );
    });

    it('não publica nada quando o trabalho dentro do lock falha', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);
      participants.remove.mockRejectedValue(new Error('db down'));

      await expect(service.leave(USER_A, CONVERSATION_ID)).rejects.toThrow('db down');
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('addMembers', () => {
    it('deve adicionar apenas quem ainda não participa e publicar members_added', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      users.getMultiple.mockResolvedValueOnce([user(USER_B, 'bob'), user(USER_C, 'carol')]);

      await service.addMembers(USER_A, CONVERSATION_ID, [USER_B, USER_C, USER_C]);

      // Valida que users.getMultiple é chamado ANTES de withLock (validação fora do lock)
      expect(users.getMultiple).toHaveBeenCalled();
      expect(conversations.withLock).toHaveBeenCalled();
      expect(users.getMultiple.mock.invocationCallOrder[0] || 0).toBeLessThan(
        (conversations.withLock as jest.Mock).mock.invocationCallOrder[0] || Infinity
      );

      expect(conversations.withLock).toHaveBeenCalledWith(CONVERSATION_ID, expect.any(Function));
      expect(participants.listByConversation).toHaveBeenNthCalledWith(1, CONVERSATION_ID, TX);
      expect(participants.addMembers).toHaveBeenCalledWith(CONVERSATION_ID, [USER_C], TX);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'members_added',
        actorId: USER_A,
        participantIds: [USER_A, USER_B, USER_C],
        affectedUserIds: [USER_C],
      });
    });

    it('não deve inserir nem publicar quando todos já participam', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      users.getMultiple.mockResolvedValueOnce([user(USER_B, 'bob')]);

      await service.addMembers(USER_A, CONVERSATION_ID, [USER_B]);

      expect(participants.addMembers).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('deve responder 403 para não admin', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      users.getMultiple.mockResolvedValueOnce([user(USER_C, 'carol')]);

      await expect(service.addMembers(USER_B, CONVERSATION_ID, [USER_C])).rejects.toThrow(
        NotConversationAdminException
      );
    });

    it('deve responder 400 ao estourar 256 participantes (contagem lida sob o lock)', async () => {
      const current = Array.from({ length: 256 }, (_, i) =>
        participant(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
      );
      givenMembership(conversation(), [participant(USER_A, 'admin'), ...current.slice(1)]);
      users.getMultiple.mockResolvedValueOnce([user(USER_C, 'carol')]);

      await expect(service.addMembers(USER_A, CONVERSATION_ID, [USER_C])).rejects.toThrow(
        GroupParticipantLimitException
      );
      expect(participants.addMembers).not.toHaveBeenCalled();
    });

    it('deve responder 404 para usuário inexistente (validação antes do lock)', async () => {
      users.getMultiple.mockResolvedValueOnce([]);

      await expect(service.addMembers(USER_A, CONVERSATION_ID, [USER_C])).rejects.toThrow(
        UsersNotFoundException
      );
      expect(conversations.withLock).not.toHaveBeenCalled();
      expect(participants.addMembers).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('remover a si mesmo equivale a sair', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_B)]);

      await service.removeMember(USER_A, CONVERSATION_ID, USER_A);

      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_A, TX);
      expect(events.publish).toHaveBeenCalledWith(
        ChatEvents.CONVERSATION_UPDATED,
        expect.objectContaining({ change: 'member_left' })
      );
    });

    it('admin remove membro (dentro do lock) e publica member_removed', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_A, 'admin')]);

      await service.removeMember(USER_A, CONVERSATION_ID, USER_B);

      expect(conversations.withLock).toHaveBeenCalledWith(CONVERSATION_ID, expect.any(Function));
      expect(participants.find).toHaveBeenCalledWith(CONVERSATION_ID, USER_B, TX);
      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_B, TX);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'member_removed',
        actorId: USER_A,
        participantIds: [USER_B, USER_A],
        affectedUserIds: [USER_B],
      });
    });

    it('publica CONVERSATION_DELETED (não member_removed) quando a remoção esvazia a conversa', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([]);

      await service.removeMember(USER_A, CONVERSATION_ID, USER_B);

      expect(conversations.delete).toHaveBeenCalledWith(CONVERSATION_ID, TX);
      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_DELETED, {
        conversationId: CONVERSATION_ID,
        actorId: USER_A,
        participantIds: [USER_B],
      });
    });

    it('deve responder 404 quando o alvo não participa', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);

      await expect(service.removeMember(USER_A, CONVERSATION_ID, USER_C)).rejects.toThrow(
        ParticipantNotFoundException
      );
      expect(participants.remove).not.toHaveBeenCalled();
    });

    it('deve responder 403 para não admin', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await expect(service.removeMember(USER_B, CONVERSATION_ID, USER_A)).rejects.toThrow(
        NotConversationAdminException
      );
    });
  });

  describe('consultas para outros módulos', () => {
    it('isParticipant e getParticipantIds vêm do cache de participantes (uma leitura)', async () => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);

      await expect(service.isParticipant(CONVERSATION_ID, USER_A)).resolves.toBe(true);
      await expect(service.isParticipant(CONVERSATION_ID, USER_D)).resolves.toBe(false);
      await expect(service.getParticipantIds(CONVERSATION_ID)).resolves.toEqual([USER_A, USER_B]);

      expect(participants.listByConversation).toHaveBeenCalledTimes(1);
      expect(participants.find).not.toHaveBeenCalled();
    });

    it('getDirectPartnerIds delega ao repositório', async () => {
      participants.listDirectPartnerIds.mockResolvedValue([USER_B]);

      await expect(service.getDirectPartnerIds(USER_A)).resolves.toEqual([USER_B]);
      expect(participants.listDirectPartnerIds).toHaveBeenCalledWith(USER_A);
    });

    it('getTypeForParticipant devolve o tipo para participante e 404 para quem não participa', async () => {
      givenMembership(conversation({ type: 'direct' }), [participant(USER_A), participant(USER_B)]);

      await expect(service.getTypeForParticipant(USER_A, CONVERSATION_ID)).resolves.toBe('direct');
      await expect(service.getTypeForParticipant(USER_C, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });

    it('getUserConversationIds', async () => {
      participants.listConversationIdsByUser.mockResolvedValue([CONVERSATION_ID]);

      await expect(service.getUserConversationIds(USER_A)).resolves.toEqual([CONVERSATION_ID]);
    });
  });
});
