import type { CreateMessageData, FindMessagesOptions, MessageRecord } from '../types';

export interface IMessageRepository {
  create(data: CreateMessageData): Promise<MessageRecord>;
  findById(id: string): Promise<MessageRecord | null>;
  /** Mais recentes primeiro; com `before`, apenas mensagens estritamente anteriores ao cursor. */
  findByConversation(
    conversationId: string,
    options: FindMessagesOptions
  ): Promise<MessageRecord[]>;
  /** Marca `deletedAt`; retorna `true` só se esta chamada apagou (idempotente sob concorrência). */
  softDelete(id: string, deletedAt: Date): Promise<boolean>;
}
