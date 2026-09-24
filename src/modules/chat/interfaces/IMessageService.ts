import type {
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
}
