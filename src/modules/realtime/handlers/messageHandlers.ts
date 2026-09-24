import type { IMessageService } from '@/modules/chat/interfaces';
import { CLIENT_EVENTS } from '../constants';
import type { RealtimeSocket } from '../types';
import { messageSendPayloadSchema, messageStatusPayloadSchema } from '../validation';
import { withAck } from './ack';

export interface MessageHandlerDeps {
  messages: Pick<IMessageService, 'send' | 'markDelivered' | 'markRead'>;
}

/**
 * `message:send`, `message:delivered` e `message:read`. Os handlers só chamam o service e
 * respondem o ack; o broadcast (`message:new`, `message:status`) sai da ponte do EventBus.
 */
export function registerMessageHandlers(
  socket: RealtimeSocket,
  { messages }: MessageHandlerDeps
): void {
  const { userId, ip, device } = socket.data;

  socket.on(
    CLIENT_EVENTS.MESSAGE_SEND,
    withAck(
      { event: CLIENT_EVENTS.MESSAGE_SEND, userId },
      messageSendPayloadSchema,
      ({ conversationId, ...message }) =>
        messages.send(userId, conversationId, message, { ip, device })
    )
  );

  socket.on(
    CLIENT_EVENTS.MESSAGE_DELIVERED,
    withAck(
      { event: CLIENT_EVENTS.MESSAGE_DELIVERED, userId },
      messageStatusPayloadSchema,
      async ({ conversationId, messageId }) => {
        await messages.markDelivered(userId, conversationId, messageId);
        return null;
      }
    )
  );

  socket.on(
    CLIENT_EVENTS.MESSAGE_READ,
    withAck(
      { event: CLIENT_EVENTS.MESSAGE_READ, userId },
      messageStatusPayloadSchema,
      async ({ conversationId, messageId }) => {
        await messages.markRead(userId, conversationId, messageId);
        return null;
      }
    )
  );
}
