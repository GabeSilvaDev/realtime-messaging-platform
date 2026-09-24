/**
 * Contrato público da mensagem de chat (REST, EventBus e Socket.IO).
 *
 * Fica em `shared` porque o `EventMap` (camada shared) o referencia no payload de
 * `chat:message-sent`; o módulo `chat` re-exporta estes tipos com os mesmos nomes.
 */
export type MessageContentType = 'text';

export interface MessageContent {
  type: MessageContentType;
  text: string;
}

/** Um destinatário no status da mensagem (entregue a / lida por) e quando. */
export interface MessageStatusEntry {
  userId: string;
  at: Date;
}

/** Status da mensagem (RF003.4): enviada = `sentAt` (= `createdAt`), entregue a, lida por. */
export interface MessageStatusDTO {
  sentAt: Date;
  deliveredTo: MessageStatusEntry[];
  readBy: MessageStatusEntry[];
}

/**
 * Mensagem como exposta pela API: apagada vira tombstone (`content: null`, `mentions: []`),
 * mantendo ids, datas e `status`. `clientMessageId` permite ao cliente conciliar mensagens
 * otimistas.
 */
export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: MessageContent | null;
  replyTo: string | null;
  mentions: string[];
  clientMessageId: string | null;
  status: MessageStatusDTO;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
