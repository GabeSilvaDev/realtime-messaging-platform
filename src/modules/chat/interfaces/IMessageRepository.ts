import type {
  CreateMessageData,
  CreateMessageResult,
  FindMessagesOptions,
  MessageRecord,
} from '../types';

export interface IMessageRepository {
  /**
   * Persiste a mensagem. Com `clientMessageId` já usado pelo mesmo remetente (índice único
   * parcial), não duplica: devolve a existente com `created: false`.
   */
  create(data: CreateMessageData): Promise<CreateMessageResult>;
  findById(id: string): Promise<MessageRecord | null>;
  findByClientMessageId(senderId: string, clientMessageId: string): Promise<MessageRecord | null>;
  /** Mais recentes primeiro; com `before`, apenas mensagens estritamente anteriores ao cursor. */
  findByConversation(
    conversationId: string,
    options: FindMessagesOptions
  ): Promise<MessageRecord[]>;
  /** Marca `deletedAt`; retorna `true` só se esta chamada apagou (idempotente sob concorrência). */
  softDelete(id: string, deletedAt: Date): Promise<boolean>;
  /** Registra a entrega a `userId`; retorna `true` só se esta chamada registrou (idempotente). */
  markDelivered(messageId: string, userId: string, at: Date): Promise<boolean>;
  /**
   * Marca como lidas por `userId` — e entregues, se ainda não estavam — as mensagens da conversa
   * de outros autores, não apagadas, com `createdAt <= upTo`. Retorna quantas passaram a lidas.
   */
  markReadUpTo(conversationId: string, userId: string, upTo: Date, at: Date): Promise<number>;
  /** Apaga todas as mensagens da conversa (usado quando a conversa é removida). */
  deleteByConversation(conversationId: string): Promise<number>;
}
