import { CHAT_CONSTANTS } from '@/modules/chat/constants';

export const REALTIME_CONSTANTS = {
  /** Sem novo `typing:start` nesse intervalo, o indicador expira (RF003.5). */
  TYPING_TTL_MS: 3000,
  /** Mesmo limite do `device` gravado nas mensagens enviadas via REST. */
  MAX_DEVICE_LENGTH: CHAT_CONSTANTS.MAX_DEVICE_LENGTH,
} as const;

export const ROOM_PREFIXES = {
  USER: 'user:',
  CONVERSATION: 'conversation:',
} as const;

/** Room pessoal: todos os sockets (abas/dispositivos) de um usuário. */
export function userRoom(userId: string): string {
  return `${ROOM_PREFIXES.USER}${userId}`;
}

/** Room da conversa: todos os sockets dos participantes. */
export function conversationRoom(conversationId: string): string {
  return `${ROOM_PREFIXES.CONVERSATION}${conversationId}`;
}

/** Eventos cliente → servidor (todos aceitam ack). */
export const CLIENT_EVENTS = {
  MESSAGE_SEND: 'message:send',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const;

/** Eventos servidor → cliente. */
export const SERVER_EVENTS = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_STATUS: 'message:status',
  TYPING_INDICATOR: 'typing:indicator',
  CONVERSATION_NEW: 'conversation:new',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_DELETED: 'conversation:deleted',
} as const;

/** `message` do `connect_error` que o cliente recebe quando o handshake é recusado. */
export const SOCKET_ERRORS = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
