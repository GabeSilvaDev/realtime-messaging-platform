import type { MessageDTO } from '../types/chat-message.types';
import type { ManualPresenceStatus } from '../types/presence.types';
import {
  SystemEvents,
  AuthEvents,
  UserEvents,
  ChatEvents,
  PresenceEvents,
  NotificationEvents,
} from '../types/event.types';

export interface EventMetadata {
  userId?: string;
  correlationId?: string;
  causationId?: string;
  sourceIp?: string;
  device?: string;
  [key: string]: unknown;
}

export interface BaseEvent<T = unknown> {
  name: string;
  payload: T;
  timestamp: Date;
  eventId: string;
  metadata?: EventMetadata;
}

export interface EventMap {
  [SystemEvents.STARTUP]: { timestamp: Date };
  [SystemEvents.SHUTDOWN]: { reason: string };
  [SystemEvents.ERROR]: { error: Error; context?: string };

  [AuthEvents.LOGIN]: { userId: string; ip: string; device?: string };
  [AuthEvents.LOGOUT]: { userId: string };
  [AuthEvents.REGISTER]: { userId: string; email: string };
  [AuthEvents.PASSWORD_RESET_REQUESTED]: { userId: string; email: string };
  [AuthEvents.PASSWORD_RESET_COMPLETED]: { userId: string };
  /**
   * Sessões do usuário revogadas (troca/reset de senha, revogação de sessões): o realtime derruba
   * todos os sockets dele; o cliente precisa se autenticar de novo.
   */
  [AuthEvents.SESSIONS_REVOKED]: { userId: string };

  [UserEvents.CREATED]: { userId: string; email: string };
  /** Perfil alterado (`fields` = campos gravados); invalida o cache do perfil público. */
  [UserEvents.UPDATED]: { userId: string; fields: string[] };
  [UserEvents.DELETED]: { userId: string };
  [UserEvents.BLOCKED]: { userId: string; blockedUserId: string };
  [UserEvents.UNBLOCKED]: { userId: string; unblockedUserId: string };
  /** `userId` adicionou `contactId` aos contatos (quem vê a presença de `contactId` mudou). */
  [UserEvents.CONTACT_ADDED]: { userId: string; contactId: string };
  /** `userId` removeu `contactId` dos contatos. */
  [UserEvents.CONTACT_REMOVED]: { userId: string; contactId: string };

  [ChatEvents.MESSAGE_SENT]: {
    messageId: string;
    conversationId: string;
    conversationType: 'direct' | 'group';
    senderId: string;
    text: string;
    mentions: string[];
    replyTo: string | null;
    createdAt: Date;
    participantIds: string[];
    /** Mesmo DTO devolvido ao cliente REST (ponte Socket.IO). */
    message: MessageDTO;
  };
  [ChatEvents.MESSAGE_DELETED]: {
    messageId: string;
    conversationId: string;
    deletedBy: string;
  };
  /** `userId` confirmou a entrega de `messageId` (uma vez por destinatário; `senderId` é o autor). */
  [ChatEvents.MESSAGE_DELIVERED]: {
    messageId: string;
    conversationId: string;
    userId: string;
    senderId: string;
    at: Date;
  };
  /** Leitura em lote: tudo de outros autores até `upToMessageId` (inclusive) foi lido por `userId`. */
  [ChatEvents.MESSAGE_READ]: {
    conversationId: string;
    userId: string;
    upToMessageId: string;
    at: Date;
  };
  [ChatEvents.TYPING_STARTED]: { conversationId: string; userId: string };
  [ChatEvents.TYPING_STOPPED]: { conversationId: string; userId: string };
  [ChatEvents.CONVERSATION_CREATED]: {
    conversationId: string;
    type: 'direct' | 'group';
    creatorId: string;
    participantIds: string[];
  };
  /**
   * `participantIds` inclui todos os afetados: em `members_added`, os participantes após a
   * mudança; em `member_removed`/`member_left`, os participantes antes da mudança (o removido
   * ou quem saiu também é notificado).
   *
   * `affectedUserIds` traz só quem foi adicionado/removido/saiu (`[]` em `renamed`, útil para a
   * ponte Socket.IO decidir a quem notificar uma entrada/saída específica). `name` só vem
   * preenchido em `renamed` (o novo nome).
   */
  [ChatEvents.CONVERSATION_UPDATED]: {
    conversationId: string;
    change: 'renamed' | 'members_added' | 'member_removed' | 'member_left';
    actorId: string;
    participantIds: string[];
    affectedUserIds: string[];
    name?: string;
  };
  /**
   * Publicado quando a saída/remoção do último membro apaga a conversa (nesse caso
   * `member_left`/`member_removed` NÃO é publicado). `participantIds` traz quem participava
   * imediatamente antes da remoção: `[actorId]` quando o último membro sai (`leave`) e
   * `[memberId]` quando um admin remove o último membro restante (`removeMember`).
   */
  [ChatEvents.CONVERSATION_DELETED]: {
    conversationId: string;
    actorId: string;
    participantIds: string[];
  };

  /** Primeira conexão válida do usuário (nenhuma outra aba/dispositivo conectado). */
  [PresenceEvents.ONLINE]: { userId: string; timestamp: Date };
  /** Última conexão encerrada (ou expirada); `lastSeen` = `users.last_seen_at` gravado. */
  [PresenceEvents.OFFLINE]: { userId: string; lastSeen: Date };
  /** Status manual alterado com o usuário conectado (o estado efetivo mudou). */
  [PresenceEvents.STATUS_CHANGED]: { userId: string; status: ManualPresenceStatus };

  [NotificationEvents.SEND]: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };
  [NotificationEvents.READ]: { notificationId: string; userId: string };

  [key: string]: unknown;
}

export type EventPayload<K extends keyof EventMap> = EventMap[K];

export type EventCallback<K extends keyof EventMap> = (
  event: BaseEvent<EventPayload<K>>
) => Promise<void> | void;

export type WildcardCallback = (eventName: string, event: BaseEvent) => Promise<void> | void;

export interface SubscriptionOptions {
  once?: boolean;
  priority?: number;
  /**
   * Roda o callback fora do caminho de quem publica (agendado com setImmediate): `publish`
   * não o aguarda e erros só contam em `totalErrors`. Para listeners com I/O pesado.
   * Com `once`, a desinscrição acontece no despacho (no `publish`), antes de o callback rodar.
   */
  async?: boolean;
}

export interface PublishOptions {
  metadata?: EventMetadata;
  async?: boolean;
}

export interface EventBusStats {
  totalPublished: number;
  totalProcessed: number;
  totalErrors: number;
  subscriberCount: number;
  eventsByType: Record<string, number>;
}

export interface Subscriber<K extends keyof EventMap = keyof EventMap> {
  id: string;
  callback: EventCallback<K>;
  options: SubscriptionOptions;
}

export interface IEventHandler<K extends keyof EventMap> {
  eventName: K;
  handle(event: BaseEvent<EventPayload<K>>): Promise<void> | void;
  register(): void;
  unregister(): void;
}
