import type {
  MessageContent,
  MessageDTO,
  MessageStatusEntry,
} from '@/shared/types/chat-message.types';

export type {
  MessageContent,
  MessageDTO,
  MessageStatusDTO,
  MessageStatusEntry,
} from '@/shared/types/chat-message.types';

export interface MessageMetadata {
  ip: string | null;
  device: string | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  content: MessageContent;
  replyTo: string | null;
  mentions: string[];
  metadata: MessageMetadata;
  /** UUID gerado pelo cliente para envio idempotente (`null` quando não informado). */
  clientMessageId: string | null;
  deliveredTo: MessageStatusEntry[];
  readBy: MessageStatusEntry[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageData {
  conversationId: string;
  senderId: string;
  content: MessageContent;
  replyTo: string | null;
  mentions: string[];
  metadata: MessageMetadata;
  clientMessageId: string | null;
}

export interface CreateMessageResult {
  record: MessageRecord;
  /** `false` quando o `clientMessageId` já existia para o remetente (nada foi criado). */
  created: boolean;
}

/** Intervalo de `createdAt` (inclusive nas duas pontas) de uma marcação de leitura em lote. */
export interface ReadRange {
  /** `last_read_at` do participante (epoch se nunca leu): o que vem antes já foi lido. */
  from: Date;
  upTo: Date;
}

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export interface FindMessagesOptions {
  limit: number;
  before?: MessageCursor;
}

export interface SendMessageDTO {
  text: string;
  replyTo?: string;
  mentions?: string[];
  /** UUID gerado pelo cliente: reenviar o mesmo id devolve a mensagem já gravada. */
  clientMessageId?: string;
}

export interface ListMessagesOptions {
  limit?: number;
  before?: string;
}

export interface PaginatedMessages {
  messages: MessageDTO[];
  nextCursor: string | null;
}
