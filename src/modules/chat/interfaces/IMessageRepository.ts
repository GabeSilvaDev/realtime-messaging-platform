import type {
  CreateMessageData,
  CreateMessageResult,
  FindMessagesOptions,
  MessageRecord,
  ReadRange,
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
   * de outros autores, não apagadas, com `range.from <= createdAt <= range.upTo` (o limite
   * inferior evita varrer o histórico inteiro a cada leitura). Retorna quantas passaram a lidas.
   */
  markReadUpTo(conversationId: string, userId: string, range: ReadRange, at: Date): Promise<number>;
  /** Apaga todas as mensagens da conversa (usado quando a conversa é removida). */
  deleteByConversation(conversationId: string): Promise<number>;
  /**
   * Mensagens NÃO apagadas com esses ids, em qualquer ordem (hidratação da busca). Ids que não
   * são ObjectId são ignorados; sem nenhum id válido, não consulta o banco.
   */
  findActiveByIds(ids: string[]): Promise<MessageRecord[]>;
  /**
   * Até `limit` mensagens (apagadas inclusive) com `_id` maior que `afterId` (`null` = desde o
   * início), em ordem crescente de `_id` — a varredura em lotes do reindex da busca.
   */
  findPageAfter(afterId: string | null, limit: number): Promise<MessageRecord[]>;
}
