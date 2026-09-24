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
}
