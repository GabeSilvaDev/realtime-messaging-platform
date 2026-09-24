import type { MessageDTO } from '../types/chat-message.types';
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

  [UserEvents.CREATED]: { userId: string; email: string };
  [UserEvents.UPDATED]: { userId: string; fields: string[] };
  [UserEvents.DELETED]: { userId: string };
  [UserEvents.BLOCKED]: { userId: string; blockedUserId: string };
  [UserEvents.UNBLOCKED]: { userId: string; unblockedUserId: string };

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
  [ChatEvents.MESSAGE_DELIVERED]: {
    messageId: string;
    conversationId: string;
    userId: string;
  };
  [ChatEvents.MESSAGE_READ]: {
    messageId: string;
    conversationId: string;
    userId: string;
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
   * Publicado quando o último membro sai/é removido e a conversa é apagada (nesse caso
   * `member_left`/`member_removed` NÃO é publicado). `participantIds` traz quem participava
   * imediatamente antes da remoção (sempre `[actorId]`, já que só há esse caminho para zerar).
   */
  [ChatEvents.CONVERSATION_DELETED]: {
    conversationId: string;
    actorId: string;
    participantIds: string[];
  };

  [PresenceEvents.ONLINE]: { userId: string; timestamp: Date };
  [PresenceEvents.OFFLINE]: { userId: string; lastSeen: Date };
  [PresenceEvents.STATUS_CHANGED]: {
    userId: string;
    status: 'available' | 'busy' | 'away';
  };

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
