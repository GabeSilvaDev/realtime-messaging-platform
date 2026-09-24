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
  ChatTransaction,
  ConversationAttributes,
  ConversationListPage,
  CreateDirectData,
  CreateDirectRecord,
  CreateGroupData,
  CreateMessageData,
  CreateMessageResult,
  FindMessagesOptions,
  MessageRecord,
  ParticipantAttributes,
  ParticipantRole,
  ReadRange,
} from '@/modules/chat/types';

/** Os repositórios em memória não têm transação real: o lock vira execução direta. */
const IN_MEMORY_TRANSACTION = {} as ChatTransaction;

export class InMemoryChatStore {
  conversations = new Map<string, ConversationAttributes>();
  participants: ParticipantAttributes[] = [];
  messages: MessageRecord[] = [];
  private clock = Date.parse('2026-09-24T10:00:00.000Z');
  private participantIdCounter = 0;

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
    this.participantIdCounter = 0;
  }

  addParticipant(
    conversationId: string,
    userId: string,
    role: ParticipantRole,
    joinedAt?: Date
  ): void {
    // Gera ID determinístico mas independente de ordem de inserção.
    // Usa descending counter: primeiro participante → 0xff, segundo → 0xfe, etc.
    // Garante que participantes inseridos depois podem ter IDs menores lexicograficamente.
    const counter = 0xff - this.participantIdCounter++;
    const counterHex = counter.toString(16).padStart(2, '0');
    const deterministic = `00000000-0000-4000-8000-0000000000${counterHex}`;
    this.participants.push({
      id: deterministic,
      conversationId,
      userId,
      role,
      joinedAt: joinedAt ?? this.now(),
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

/** Cópia defensiva (inclusive dos arrays de status) — o chamador não altera o store. */
function copy(record: MessageRecord): MessageRecord {
  return {
    ...record,
    mentions: [...record.mentions],
    deliveredTo: record.deliveredTo.map((entry) => ({ ...entry })),
    readBy: record.readBy.map((entry) => ({ ...entry })),
  };
}

function oldestFirst(a: ParticipantAttributes, b: ParticipantAttributes): number {
  const joinedDiff = a.joinedAt.getTime() - b.joinedAt.getTime();
  return joinedDiff !== 0 ? joinedDiff : a.id.localeCompare(b.id);
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
    const bulkJoinedAt = this.store.now();
    userIds.forEach((userId) => {
      this.store.addParticipant(conversation.id, userId, 'member', bulkJoinedAt);
    });
    return { conversation, created: true };
  }

  async createGroup({
    name,
    createdBy,
    memberIds,
  }: CreateGroupData): Promise<ConversationAttributes> {
    const conversation = this.store.createConversation({ type: 'group', name, createdBy });
    const bulkJoinedAt = this.store.now();
    this.store.addParticipant(conversation.id, createdBy, 'admin', bulkJoinedAt);
    memberIds.forEach((userId) => {
      this.store.addParticipant(conversation.id, userId, 'member', bulkJoinedAt);
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

  async withLock<T>(
    _conversationId: string,
    work: (transaction: ChatTransaction) => Promise<T>
  ): Promise<T> {
    return work(IN_MEMORY_TRANSACTION);
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

  async listDirectPartnerIds(userId: string): Promise<string[]> {
    const direct = new Set(
      this.store.participants
        .filter(
          (p) =>
            p.userId === userId && this.store.conversations.get(p.conversationId)?.type === 'direct'
        )
        .map((p) => p.conversationId)
    );
    return this.store.participants
      .filter((p) => direct.has(p.conversationId) && p.userId !== userId)
      .map((p) => p.userId);
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<void> {
    const bulkJoinedAt = this.store.now();
    for (const userId of userIds) {
      if ((await this.find(conversationId, userId)) === null) {
        this.store.addParticipant(conversationId, userId, 'member', bulkJoinedAt);
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

  async advanceLastReadAt(conversationId: string, userId: string, at: Date): Promise<void> {
    const participant = await this.find(conversationId, userId);
    if (participant !== null && (participant.lastReadAt === null || participant.lastReadAt < at)) {
      participant.lastReadAt = at;
    }
  }
}

export class InMemoryMessageRepository implements IMessageRepository {
  constructor(private readonly store: InMemoryChatStore) {}

  async create(data: CreateMessageData): Promise<CreateMessageResult> {
    if (data.clientMessageId !== null) {
      const existing = await this.findByClientMessageId(data.senderId, data.clientMessageId);
      if (existing !== null) {
        return { record: existing, created: false };
      }
    }
    const at = this.store.now();
    const record: MessageRecord = {
      ...data,
      id: randomBytes(12).toString('hex'),
      deliveredTo: [],
      readBy: [],
      deletedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.store.messages.push(record);
    return { record: copy(record), created: true };
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const record = this.store.messages.find((m) => m.id === id);
    return record === undefined ? null : copy(record);
  }

  async findByClientMessageId(
    senderId: string,
    clientMessageId: string
  ): Promise<MessageRecord | null> {
    const record = this.store.messages.find(
      (m) => m.senderId === senderId && m.clientMessageId === clientMessageId
    );
    return record === undefined ? null : copy(record);
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
      .map(copy);
  }

  async softDelete(id: string, deletedAt: Date): Promise<boolean> {
    const record = this.store.messages.find((m) => m.id === id);
    if (record === undefined || record.deletedAt !== null) {
      return false;
    }
    record.deletedAt = deletedAt;
    return true;
  }

  async markDelivered(messageId: string, userId: string, at: Date): Promise<boolean> {
    const record = this.store.messages.find((m) => m.id === messageId);
    if (record === undefined || record.deliveredTo.some((entry) => entry.userId === userId)) {
      return false;
    }
    record.deliveredTo.push({ userId, at });
    return true;
  }

  async markReadUpTo(
    conversationId: string,
    userId: string,
    { from, upTo }: ReadRange,
    at: Date
  ): Promise<number> {
    let count = 0;
    for (const record of this.store.messages) {
      const eligible =
        record.conversationId === conversationId &&
        record.createdAt >= from &&
        record.createdAt <= upTo &&
        record.senderId !== userId &&
        record.deletedAt === null;
      if (!eligible) {
        continue;
      }
      if (!record.deliveredTo.some((entry) => entry.userId === userId)) {
        record.deliveredTo.push({ userId, at });
      }
      if (!record.readBy.some((entry) => entry.userId === userId)) {
        record.readBy.push({ userId, at });
        count++;
      }
    }
    return count;
  }

  async deleteByConversation(conversationId: string): Promise<number> {
    const before = this.store.messages.length;
    this.store.messages = this.store.messages.filter((m) => m.conversationId !== conversationId);
    return before - this.store.messages.length;
  }

  async findActiveByIds(ids: string[]): Promise<MessageRecord[]> {
    return this.store.messages.filter((m) => ids.includes(m.id) && m.deletedAt === null).map(copy);
  }

  /** Ids aleatórios em hexadecimal: a ordem de `id` é estável, como a de `_id` no MongoDB. */
  async findPageAfter(afterId: string | null, limit: number): Promise<MessageRecord[]> {
    return [...this.store.messages]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((m) => afterId === null || m.id > afterId)
      .slice(0, limit)
      .map(copy);
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
