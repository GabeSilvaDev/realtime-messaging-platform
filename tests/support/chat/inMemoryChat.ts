// Repositórios do chat em memória para os feature tests: exercitam os services reais
// (regras de negócio) sem PostgreSQL/MongoDB. Não é arquivo de teste (não casa com testMatch).
import { randomBytes, randomUUID } from 'crypto';
import type {
  IConversationRepository,
  IMessageRepository,
  IParticipantRepository,
  ListForUserOptions,
} from '@/modules/chat/interfaces';
import type {
  ConversationAttributes,
  ConversationListPage,
  CreateDirectData,
  CreateDirectRecord,
  CreateGroupData,
  CreateMessageData,
  FindMessagesOptions,
  MessageRecord,
  ParticipantAttributes,
  ParticipantRole,
} from '@/modules/chat/types';

export class InMemoryChatStore {
  conversations = new Map<string, ConversationAttributes>();
  participants: ParticipantAttributes[] = [];
  messages: MessageRecord[] = [];
  private clock = Date.parse('2026-09-24T10:00:00.000Z');

  /** Relógio monotônico: cada chamada avança 1s (ordenações determinísticas). */
  now(): Date {
    this.clock += 1000;
    return new Date(this.clock);
  }

  reset(): void {
    this.conversations.clear();
    this.participants = [];
    this.messages = [];
    this.clock = Date.parse('2026-09-24T10:00:00.000Z');
  }

  addParticipant(conversationId: string, userId: string, role: ParticipantRole): void {
    this.participants.push({
      id: randomUUID(),
      conversationId,
      userId,
      role,
      joinedAt: this.now(),
      lastReadAt: null,
      isMuted: false,
      archivedAt: null,
    });
  }

  createConversation(
    data: Partial<ConversationAttributes> & Pick<ConversationAttributes, 'type'>
  ): ConversationAttributes {
    const at = this.now();
    const conversation: ConversationAttributes = {
      id: randomUUID(),
      name: null,
      avatarUrl: null,
      createdBy: null,
      directKey: null,
      lastMessageAt: null,
      createdAt: at,
      updatedAt: at,
      ...data,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }
}

function oldestFirst(a: ParticipantAttributes, b: ParticipantAttributes): number {
  return a.joinedAt.getTime() - b.joinedAt.getTime();
}

export class InMemoryConversationRepository implements IConversationRepository {
  constructor(private readonly store: InMemoryChatStore) {}

  async findById(id: string): Promise<ConversationAttributes | null> {
    return this.store.conversations.get(id) ?? null;
  }

  async findByDirectKey(directKey: string): Promise<ConversationAttributes | null> {
    return [...this.store.conversations.values()].find((c) => c.directKey === directKey) ?? null;
  }

  async createDirect({
    directKey,
    createdBy,
    userIds,
  }: CreateDirectData): Promise<CreateDirectRecord> {
    const existing = await this.findByDirectKey(directKey);
    if (existing !== null) {
      return { conversation: existing, created: false };
    }
    const conversation = this.store.createConversation({ type: 'direct', directKey, createdBy });
    userIds.forEach((userId) => {
      this.store.addParticipant(conversation.id, userId, 'member');
    });
    return { conversation, created: true };
  }

  async createGroup({
    name,
    createdBy,
    memberIds,
  }: CreateGroupData): Promise<ConversationAttributes> {
    const conversation = this.store.createConversation({ type: 'group', name, createdBy });
    this.store.addParticipant(conversation.id, createdBy, 'admin');
    memberIds.forEach((userId) => {
      this.store.addParticipant(conversation.id, userId, 'member');
    });
    return conversation;
  }

  async listForUser(
    userId: string,
    { archived, limit, offset }: ListForUserOptions
  ): Promise<ConversationListPage> {
    const rows = this.store.participants
      .filter((p) => p.userId === userId && (p.archivedAt !== null) === archived)
      .flatMap((membership) => {
        const conversation = this.store.conversations.get(membership.conversationId);
        return conversation === undefined ? [] : [{ conversation, membership }];
      })
      .sort((a, b) => {
        const lastA = a.conversation.lastMessageAt?.getTime() ?? -Infinity;
        const lastB = b.conversation.lastMessageAt?.getTime() ?? -Infinity;
        return (
          lastB - lastA || b.conversation.createdAt.getTime() - a.conversation.createdAt.getTime()
        );
      });
    return { total: rows.length, rows: rows.slice(offset, offset + limit) };
  }

  async rename(id: string, name: string): Promise<void> {
    const conversation = this.store.conversations.get(id);
    if (conversation !== undefined) {
      conversation.name = name;
    }
  }

  async touchLastMessageAt(id: string, at: Date): Promise<void> {
    const conversation = this.store.conversations.get(id);
    if (
      conversation !== undefined &&
      (conversation.lastMessageAt === null || conversation.lastMessageAt < at)
    ) {
      conversation.lastMessageAt = at;
    }
  }

  async delete(id: string): Promise<void> {
    this.store.conversations.delete(id);
    this.store.participants = this.store.participants.filter((p) => p.conversationId !== id);
  }
}

export class InMemoryParticipantRepository implements IParticipantRepository {
  constructor(private readonly store: InMemoryChatStore) {}

  async find(conversationId: string, userId: string): Promise<ParticipantAttributes | null> {
    return (
      this.store.participants.find(
        (p) => p.conversationId === conversationId && p.userId === userId
      ) ?? null
    );
  }

  async listByConversation(conversationId: string): Promise<ParticipantAttributes[]> {
    return this.store.participants
      .filter((p) => p.conversationId === conversationId)
      .sort(oldestFirst);
  }

  async listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]> {
    return this.store.participants
      .filter((p) => conversationIds.includes(p.conversationId))
      .sort(oldestFirst);
  }

  async listConversationIdsByUser(userId: string): Promise<string[]> {
    return this.store.participants.filter((p) => p.userId === userId).map((p) => p.conversationId);
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      if ((await this.find(conversationId, userId)) === null) {
        this.store.addParticipant(conversationId, userId, 'member');
      }
    }
  }

  async remove(conversationId: string, userId: string): Promise<void> {
    this.store.participants = this.store.participants.filter(
      (p) => !(p.conversationId === conversationId && p.userId === userId)
    );
  }

  async setRole(conversationId: string, userId: string, role: ParticipantRole): Promise<void> {
    const participant = await this.find(conversationId, userId);
    if (participant !== null) {
      participant.role = role;
    }
  }

  async setArchivedAt(
    conversationId: string,
    userId: string,
    archivedAt: Date | null
  ): Promise<void> {
    const participant = await this.find(conversationId, userId);
    if (participant !== null) {
      participant.archivedAt = archivedAt;
    }
  }
}

export class InMemoryMessageRepository implements IMessageRepository {
  constructor(private readonly store: InMemoryChatStore) {}

  async create(data: CreateMessageData): Promise<MessageRecord> {
    const at = this.store.now();
    const record: MessageRecord = {
      ...data,
      id: randomBytes(12).toString('hex'),
      deletedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.store.messages.push(record);
    return { ...record };
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const record = this.store.messages.find((m) => m.id === id);
    return record === undefined ? null : { ...record };
  }

  async findByConversation(
    conversationId: string,
    { limit, before }: FindMessagesOptions
  ): Promise<MessageRecord[]> {
    return this.store.messages
      .filter((m) => m.conversationId === conversationId)
      .filter(
        (m) =>
          before === undefined ||
          m.createdAt < before.createdAt ||
          (m.createdAt.getTime() === before.createdAt.getTime() && m.id < before.id)
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }

  async softDelete(id: string, deletedAt: Date): Promise<boolean> {
    const record = this.store.messages.find((m) => m.id === id);
    if (record === undefined || record.deletedAt !== null) {
      return false;
    }
    record.deletedAt = deletedAt;
    return true;
  }
}

export function createInMemoryChatRepositories(): {
  store: InMemoryChatStore;
  conversationRepository: InMemoryConversationRepository;
  participantRepository: InMemoryParticipantRepository;
  messageRepository: InMemoryMessageRepository;
} {
  const store = new InMemoryChatStore();
  return {
    store,
    conversationRepository: new InMemoryConversationRepository(store),
    participantRepository: new InMemoryParticipantRepository(store),
    messageRepository: new InMemoryMessageRepository(store),
  };
}
