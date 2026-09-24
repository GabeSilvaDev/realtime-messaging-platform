import type { ParticipantAttributes, ParticipantRole } from '../types';

export interface IParticipantRepository {
  find(conversationId: string, userId: string): Promise<ParticipantAttributes | null>;
  /** Participantes da conversa, do mais antigo (`joined_at`) para o mais novo. */
  listByConversation(conversationId: string): Promise<ParticipantAttributes[]>;
  listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]>;
  listConversationIdsByUser(userId: string): Promise<string[]>;
  /** Adiciona como `member`, ignorando quem já participa. */
  addMembers(conversationId: string, userIds: string[]): Promise<void>;
  remove(conversationId: string, userId: string): Promise<void>;
  setRole(conversationId: string, userId: string, role: ParticipantRole): Promise<void>;
  setArchivedAt(conversationId: string, userId: string, archivedAt: Date | null): Promise<void>;
}
