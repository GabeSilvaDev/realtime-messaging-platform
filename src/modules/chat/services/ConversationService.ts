import type { IContactService, IUserService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { userService } from '@/modules/user/services/UserService';
import type { PublicUserDTO } from '@/modules/user/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents } from '@/shared/types';
import { CHAT_CONSTANTS } from '../constants';
import {
  CannotConverseWithSelfException,
  ConversationBlockedException,
  ConversationNotFoundException,
  GroupOnlyOperationException,
  GroupParticipantLimitException,
  NotConversationAdminException,
  ParticipantNotFoundException,
  UsersNotFoundException,
} from '../errors';
import type {
  IConversationRepository,
  IConversationService,
  IParticipantRepository,
} from '../interfaces';
import { conversationRepository, participantRepository } from '../repositories';
import type {
  ChatTransaction,
  ConversationChange,
  ConversationDTO,
  ConversationListEntry,
  ConversationType,
  CreateDirectResult,
  CreateGroupDTO,
  ListConversationsOptions,
  PaginatedConversations,
  ParticipantAttributes,
} from '../types';

/** Resultado de remover um participante sob o lock da conversa. */
interface ParticipantRemoval {
  remaining: string[];
  deleted: boolean;
}

/** Chave única da conversa 1:1: `menorUuid:maiorUuid` (independe de quem iniciou). */
export function buildDirectKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

export class ConversationService implements IConversationService {
  constructor(
    private readonly conversations: IConversationRepository = conversationRepository,
    private readonly participants: IParticipantRepository = participantRepository,
    private readonly users: Pick<IUserService, 'exists' | 'getMultiple'> = userService,
    private readonly contacts: Pick<IContactService, 'isBlockedByEither'> = contactService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

  async createDirect(userId: string, otherUserId: string): Promise<CreateDirectResult> {
    if (userId === otherUserId) {
      throw new CannotConverseWithSelfException();
    }

    if (!(await this.users.exists(otherUserId))) {
      throw new UsersNotFoundException([otherUserId]);
    }

    if (await this.contacts.isBlockedByEither(userId, otherUserId)) {
      throw new ConversationBlockedException();
    }

    const directKey = buildDirectKey(userId, otherUserId);
    const existing = await this.conversations.findByDirectKey(directKey);
    if (existing !== null) {
      return { conversation: await this.get(userId, existing.id), created: false };
    }

    const { conversation, created } = await this.conversations.createDirect({
      directKey,
      createdBy: userId,
      userIds: [userId, otherUserId],
    });

    if (created) {
      await this.events.publish(ChatEvents.CONVERSATION_CREATED, {
        conversationId: conversation.id,
        type: 'direct',
        creatorId: userId,
        participantIds: [userId, otherUserId],
      });
    }

    return { conversation: await this.get(userId, conversation.id), created };
  }

  async createGroup(
    userId: string,
    { name, participantIds }: CreateGroupDTO
  ): Promise<ConversationDTO> {
    const memberIds = [...new Set(participantIds)].filter((id) => id !== userId);

    if (memberIds.length + 1 > CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS) {
      throw new GroupParticipantLimitException();
    }

    await this.ensureUsersExist(memberIds);

    const conversation = await this.conversations.createGroup({
      name,
      createdBy: userId,
      memberIds,
    });

    await this.events.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: conversation.id,
      type: 'group',
      creatorId: userId,
      participantIds: [userId, ...memberIds],
    });

    return this.get(userId, conversation.id);
  }

  async list(
    userId: string,
    options: ListConversationsOptions = {}
  ): Promise<PaginatedConversations> {
    const {
      archived = false,
      limit = CHAT_CONSTANTS.DEFAULT_CONVERSATION_LIMIT,
      offset = 0,
    } = options;
    const pageSize = Math.min(limit, CHAT_CONSTANTS.MAX_CONVERSATION_LIMIT);

    const page = await this.conversations.listForUser(userId, {
      archived,
      limit: pageSize,
      offset,
    });

    const participants = await this.participants.listByConversations(
      page.rows.map((row) => row.conversation.id)
    );
    const users = await this.users.getMultiple([...new Set(participants.map((p) => p.userId))]);

    const participantsByConversation = groupParticipantsByConversation(participants);
    const usersById = indexUsersById(users);

    const items = page.rows.map((entry) =>
      this.toDTO(entry, participantsByConversation.get(entry.conversation.id) ?? [], usersById)
    );

    return {
      items,
      total: page.total,
      limit: pageSize,
      offset,
      hasMore: offset + page.rows.length < page.total,
    };
  }

  async get(userId: string, conversationId: string): Promise<ConversationDTO> {
    const context = await this.requireMembership(conversationId, userId);
    const participants = await this.participants.listByConversation(conversationId);
    const users = await this.users.getMultiple(participants.map((p) => p.userId));
    return this.toDTO(context, participants, indexUsersById(users));
  }

  async rename(userId: string, conversationId: string, name: string): Promise<ConversationDTO> {
    const context = await this.requireMembership(conversationId, userId);
    this.assertGroupAdmin(context);

    await this.conversations.rename(conversationId, name);
    await this.publishUpdate(
      conversationId,
      'renamed',
      userId,
      await this.getParticipantIds(conversationId),
      [],
      name
    );

    return this.get(userId, conversationId);
  }

  async archive(userId: string, conversationId: string): Promise<void> {
    await this.requireMembership(conversationId, userId);
    await this.participants.setArchivedAt(conversationId, userId, new Date());
  }

  async unarchive(userId: string, conversationId: string): Promise<void> {
    await this.requireMembership(conversationId, userId);
    await this.participants.setArchivedAt(conversationId, userId, null);
  }

  /**
   * Sai do grupo. Leitura, remoção e promoção de admin rodam sob o lock da conversa
   * (`withLock`); os eventos só são publicados depois do commit.
   */
  async leave(userId: string, conversationId: string): Promise<void> {
    const removal = await this.conversations.withLock(conversationId, async (transaction) => {
      const { conversation } = await this.requireMembership(conversationId, userId, transaction);
      if (conversation.type !== 'group') {
        throw new GroupOnlyOperationException();
      }
      return this.removeParticipant(conversationId, userId, transaction);
    });

    await this.publishRemoval(conversationId, userId, userId, 'member_left', removal);
  }

  /** O limite de 256 é checado sob o lock: dois admins adicionando ao mesmo tempo não o furam. */
  async addMembers(
    userId: string,
    conversationId: string,
    userIds: string[]
  ): Promise<ConversationDTO> {
    // Valida usuários ANTES de adquirir o lock (evita pool de conexão travado)
    const uniqueUserIds = [...new Set(userIds)];
    await this.ensureUsersExist(uniqueUserIds);

    const { currentIds, toAdd } = await this.conversations.withLock(
      conversationId,
      async (transaction) => {
        const context = await this.requireMembership(conversationId, userId, transaction);
        this.assertGroupAdmin(context);

        const members = await this.participants.listByConversation(conversationId, transaction);
        const memberIds = members.map((p) => p.userId);
        const newIds = uniqueUserIds.filter((id) => !memberIds.includes(id));

        if (memberIds.length + newIds.length > CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS) {
          throw new GroupParticipantLimitException();
        }

        if (newIds.length > 0) {
          await this.participants.addMembers(conversationId, newIds, transaction);
        }
        return { currentIds: memberIds, toAdd: newIds };
      }
    );

    if (toAdd.length > 0) {
      await this.publishUpdate(
        conversationId,
        'members_added',
        userId,
        [...currentIds, ...toAdd],
        toAdd
      );
    }

    return this.get(userId, conversationId);
  }

  async removeMember(userId: string, conversationId: string, memberId: string): Promise<void> {
    if (memberId === userId) {
      await this.leave(userId, conversationId);
      return;
    }

    const removal = await this.conversations.withLock(conversationId, async (transaction) => {
      const context = await this.requireMembership(conversationId, userId, transaction);
      this.assertGroupAdmin(context);

      const target = await this.participants.find(conversationId, memberId, transaction);
      if (target === null) {
        throw new ParticipantNotFoundException();
      }

      return this.removeParticipant(conversationId, memberId, transaction);
    });

    await this.publishRemoval(conversationId, userId, memberId, 'member_removed', removal);
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    return (await this.participants.find(conversationId, userId)) !== null;
  }

  async getParticipantIds(conversationId: string): Promise<string[]> {
    const participants = await this.participants.listByConversation(conversationId);
    return participants.map((p) => p.userId);
  }

  async getUserConversationIds(userId: string): Promise<string[]> {
    return this.participants.listConversationIdsByUser(userId);
  }

  async getTypeForParticipant(userId: string, conversationId: string): Promise<ConversationType> {
    const { conversation } = await this.requireMembership(conversationId, userId);
    return conversation.type;
  }

  /** Não participante recebe 404 — não revela a existência da conversa. */
  private async requireMembership(
    conversationId: string,
    userId: string,
    transaction?: ChatTransaction
  ): Promise<ConversationListEntry> {
    const membership = await this.participants.find(conversationId, userId, transaction);
    if (membership === null) {
      throw new ConversationNotFoundException();
    }

    const conversation = await this.conversations.findById(conversationId, transaction);
    if (conversation === null) {
      throw new ConversationNotFoundException();
    }

    return { conversation, membership };
  }

  private assertGroupAdmin({ conversation, membership }: ConversationListEntry): void {
    if (conversation.type !== 'group') {
      throw new GroupOnlyOperationException();
    }
    if (membership.role !== 'admin') {
      throw new NotConversationAdminException();
    }
  }

  private async ensureUsersExist(userIds: string[]): Promise<void> {
    const found = await this.users.getMultiple(userIds);
    const foundIds = new Set(found.map((user) => user.id));
    const missing = userIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new UsersNotFoundException(missing);
    }
  }

  /**
   * Remove o participante; se não restar ninguém, apaga a conversa (`deleted: true`); se não
   * restar admin, promove o participante mais antigo (`joined_at`). Retorna os ids restantes.
   */
  private async removeParticipant(
    conversationId: string,
    userId: string,
    transaction: ChatTransaction
  ): Promise<ParticipantRemoval> {
    await this.participants.remove(conversationId, userId, transaction);
    const remaining = await this.participants.listByConversation(conversationId, transaction);

    const [oldest] = remaining;
    if (oldest === undefined) {
      await this.conversations.delete(conversationId, transaction);
      return { remaining: [], deleted: true };
    }

    if (!remaining.some((p) => p.role === 'admin')) {
      await this.participants.setRole(conversationId, oldest.userId, 'admin', transaction);
    }

    return { remaining: remaining.map((p) => p.userId), deleted: false };
  }

  /**
   * Publica o resultado de uma saída/remoção: `CONVERSATION_DELETED` quando a conversa ficou
   * vazia e foi apagada (e então NÃO publica `member_left`/`member_removed`); senão,
   * `CONVERSATION_UPDATED` com quem saiu/foi removido também em `participantIds`.
   */
  private async publishRemoval(
    conversationId: string,
    actorId: string,
    removedId: string,
    change: 'member_left' | 'member_removed',
    { remaining, deleted }: ParticipantRemoval
  ): Promise<void> {
    if (deleted) {
      await this.events.publish(ChatEvents.CONVERSATION_DELETED, {
        conversationId,
        actorId,
        participantIds: [removedId],
      });
      return;
    }

    await this.publishUpdate(
      conversationId,
      change,
      actorId,
      [removedId, ...remaining],
      [removedId]
    );
  }

  private async publishUpdate(
    conversationId: string,
    change: ConversationChange,
    actorId: string,
    participantIds: string[],
    affectedUserIds: string[],
    name?: string
  ): Promise<void> {
    await this.events.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId,
      change,
      actorId,
      participantIds,
      affectedUserIds,
      ...(name !== undefined ? { name } : {}),
    });
  }

  private toDTO(
    { conversation, membership }: ConversationListEntry,
    participants: ParticipantAttributes[],
    usersById: Map<string, PublicUserDTO>
  ): ConversationDTO {
    return {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      avatarUrl: conversation.avatarUrl,
      createdBy: conversation.createdBy,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      participants: participants.flatMap((participant) => {
        const user = usersById.get(participant.userId);
        return user === undefined
          ? []
          : [
              {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                role: participant.role,
              },
            ];
      }),
      membership: {
        role: membership.role,
        isMuted: membership.isMuted,
        archivedAt: membership.archivedAt,
      },
    };
  }
}

/** Agrupa em uma única passada — evita um `.filter` por conversa (O(n·m) → O(n)). */
function groupParticipantsByConversation(
  participants: ParticipantAttributes[]
): Map<string, ParticipantAttributes[]> {
  const byConversation = new Map<string, ParticipantAttributes[]>();
  for (const participant of participants) {
    const bucket = byConversation.get(participant.conversationId);
    if (bucket === undefined) {
      byConversation.set(participant.conversationId, [participant]);
    } else {
      bucket.push(participant);
    }
  }
  return byConversation;
}

/** Indexa por id — evita um `.find` por participante (O(n·m) → O(n)). */
function indexUsersById(users: PublicUserDTO[]): Map<string, PublicUserDTO> {
  return new Map(users.map((user) => [user.id, user]));
}

export const conversationService = new ConversationService();
