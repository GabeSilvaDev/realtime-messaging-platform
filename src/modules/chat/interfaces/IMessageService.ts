import type {
  IndexableMessage,
  ListMessagesOptions,
  MessageDTO,
  MessageMetadata,
  PaginatedMessages,
  SendMessageDTO,
} from '../types';

export interface IMessageService {
  send(
    userId: string,
    conversationId: string,
    data: SendMessageDTO,
    metadata: MessageMetadata
  ): Promise<MessageDTO>;
  list(
    userId: string,
    conversationId: string,
    options?: ListMessagesOptions
  ): Promise<PaginatedMessages>;
  delete(userId: string, conversationId: string, messageId: string): Promise<void>;
  /** Confirma a entrega a `userId` (autor não marca a própria; idempotente). */
  markDelivered(userId: string, conversationId: string, messageId: string): Promise<void>;
  /** Marca como lido tudo de outros autores até `messageId` e avança `last_read_at`. */
  markRead(userId: string, conversationId: string, messageId: string): Promise<void>;
  /**
   * DTOs das mensagens NÃO apagadas com esses ids, em qualquer ordem. Sem checagem de
   * participante: quem chama (a busca) já restringiu os ids às conversas do usuário.
   */
  findByIdsForSearch(ids: string[]): Promise<MessageDTO[]>;
  /**
   * Percorre TODAS as mensagens (apagadas com `text: null`) em lotes de `batchSize` (mínimo 1),
   * pelo cursor de `_id`, chamando `handler` a cada lote; devolve quantas percorreu. Um erro do
   * `handler` interrompe a varredura e propaga.
   */
  forEachForIndexing(
    batchSize: number,
    handler: (batch: IndexableMessage[]) => Promise<void>
  ): Promise<number>;
}
