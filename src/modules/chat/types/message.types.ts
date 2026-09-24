import type { MessageContentType } from './chat.types';

export interface MessageContent {
  type: MessageContentType;
  text: string;
}

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
}

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export interface FindMessagesOptions {
  limit: number;
  before?: MessageCursor;
}

/** Mensagem como exposta pela API: apagada vira tombstone (`content: null`). */
export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: MessageContent | null;
  replyTo: string | null;
  mentions: string[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendMessageDTO {
  text: string;
  replyTo?: string;
  mentions?: string[];
}

export interface ListMessagesOptions {
  limit?: number;
  before?: string;
}

export interface PaginatedMessages {
  messages: MessageDTO[];
  nextCursor: string | null;
}
