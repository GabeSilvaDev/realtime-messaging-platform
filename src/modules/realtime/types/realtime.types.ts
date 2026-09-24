import type { DisconnectReason, ExtendedError, Server, Socket } from 'socket.io';
import type { ConversationChange, ConversationType, MessageDTO } from '@/modules/chat/types';

/** Dados do socket preenchidos pelo middleware de autenticação do handshake. */
export interface SocketData {
  userId: string;
  ip: string | null;
  device: string | null;
  /** Expiração do access token do handshake (ms desde epoch); `null` se desconhecida. */
  tokenExpiresAt: number | null;
}

export interface AckErrorDetail {
  field: string;
  message: string;
}

/** Mesmo formato de erro da API REST (`AppError`), sem timestamp. */
export interface AckError {
  code: string;
  message: string;
  statusCode: number;
  details?: AckErrorDetail[];
}

export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: AckError };

export type AckCallback<T> = (response: AckResponse<T>) => void;

/**
 * Eventos cliente → servidor. Payload e ack chegam sem garantia de formato (qualquer cliente
 * pode emitir qualquer coisa): os handlers validam o payload com Zod e só chamam o ack se for
 * uma função.
 */
export interface ClientToServerEvents {
  'message:send': (payload: unknown, ack?: unknown) => void;
  'message:delivered': (payload: unknown, ack?: unknown) => void;
  'message:read': (payload: unknown, ack?: unknown) => void;
  'typing:start': (payload: unknown, ack?: unknown) => void;
  'typing:stop': (payload: unknown, ack?: unknown) => void;
}

export interface MessageDeletedPayload {
  conversationId: string;
  messageId: string;
}

export interface MessageDeliveredStatus {
  type: 'delivered';
  conversationId: string;
  messageId: string;
  userId: string;
  at: Date;
}

export interface MessageReadStatus {
  type: 'read';
  conversationId: string;
  userId: string;
  upToMessageId: string;
  at: Date;
}

export type MessageStatusPayload = MessageDeliveredStatus | MessageReadStatus;

export interface TypingIndicatorPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface ConversationNewPayload {
  conversationId: string;
  type: ConversationType;
}

export interface ConversationUpdatedPayload {
  conversationId: string;
  change: ConversationChange;
  actorId: string;
  affectedUserIds: string[];
  name?: string;
}

export interface ConversationDeletedPayload {
  conversationId: string;
}

/** Eventos servidor → cliente (datas chegam ao cliente como strings ISO). */
export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void;
  'message:deleted': (payload: MessageDeletedPayload) => void;
  'message:status': (payload: MessageStatusPayload) => void;
  'typing:indicator': (payload: TypingIndicatorPayload) => void;
  'conversation:new': (payload: ConversationNewPayload) => void;
  'conversation:updated': (payload: ConversationUpdatedPayload) => void;
  'conversation:deleted': (payload: ConversationDeletedPayload) => void;
}

/** Sem eventos entre servidores além dos do próprio adapter. */
export type InterServerEvents = Record<string, never>;

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Função de confiança em proxies do Express (`app.get('trust proxy fn')`, via `proxy-addr`). */
export type TrustProxyFn = (addr: string, i: number) => boolean;

/** Middleware do handshake (`io.use`): `next(error)` recusa a conexão com `connect_error`. */
export type SocketMiddleware = (
  socket: RealtimeSocket,
  next: (error?: ExtendedError) => void
) => void;

/** Hook rodado a cada conexão aceita (ex.: presença online). Erros são logados, nunca derrubam. */
export type ConnectionHook = (socket: RealtimeSocket, io: RealtimeServer) => void | Promise<void>;

/**
 * Hook rodado a cada desconexão, com o motivo do Socket.IO (ex.: `server shutting down` no
 * encerramento do processo, que a presença pode ignorar). Erros são logados, nunca derrubam.
 */
export type DisconnectHook = (
  socket: RealtimeSocket,
  reason: DisconnectReason,
  io: RealtimeServer
) => void | Promise<void>;
