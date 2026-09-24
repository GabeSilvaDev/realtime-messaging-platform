import type { ChatTransaction, ParticipantAttributes, ParticipantRole } from '../types';

/** `transaction` (opcional) vem de `IConversationRepository.withLock`. */
export interface IParticipantRepository {
  find(
    conversationId: string,
    userId: string,
    transaction?: ChatTransaction
  ): Promise<ParticipantAttributes | null>;
  /** Participantes da conversa, do mais antigo (`joined_at`) para o mais novo. */
  listByConversation(
    conversationId: string,
    transaction?: ChatTransaction
  ): Promise<ParticipantAttributes[]>;
  listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]>;
  listConversationIdsByUser(userId: string): Promise<string[]>;
  /** Quem conversa com `userId` em conversas `direct` (o outro participante de cada uma). */
  listDirectPartnerIds(userId: string): Promise<string[]>;
  /** Adiciona como `member`, ignorando quem já participa. */
  addMembers(
    conversationId: string,
    userIds: string[],
    transaction?: ChatTransaction
  ): Promise<void>;
  remove(conversationId: string, userId: string, transaction?: ChatTransaction): Promise<void>;
  setRole(
    conversationId: string,
    userId: string,
    role: ParticipantRole,
    transaction?: ChatTransaction
  ): Promise<void>;
  setArchivedAt(conversationId: string, userId: string, archivedAt: Date | null): Promise<void>;
  /** `last_read_at = max(atual, at)` — nunca retrocede. */
  advanceLastReadAt(conversationId: string, userId: string, at: Date): Promise<void>;
}
