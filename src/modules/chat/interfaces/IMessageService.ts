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
}
