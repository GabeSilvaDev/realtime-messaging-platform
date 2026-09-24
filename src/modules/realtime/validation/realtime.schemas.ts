import { z } from 'zod';
import {
  conversationIdParamSchema,
  messageParamSchema,
  sendMessageSchema,
} from '@/modules/chat/validation';

/** Mesmas regras (e mensagens) da API REST: UUID normalizado e ObjectId de 24 hex. */
const conversationId = conversationIdParamSchema.shape.id;
const messageId = messageParamSchema.shape.messageId;

/** `message:send` — o corpo de `POST /messages` mais o `conversationId`. */
export const messageSendPayloadSchema = sendMessageSchema.extend({ conversationId });

/** `message:delivered` e `message:read`. */
export const messageStatusPayloadSchema = z.object({ conversationId, messageId });

/** `typing:start` e `typing:stop`. */
export const typingPayloadSchema = z.object({ conversationId });

export type MessageSendPayload = z.infer<typeof messageSendPayloadSchema>;
export type MessageStatusPayloadInput = z.infer<typeof messageStatusPayloadSchema>;
export type TypingPayload = z.infer<typeof typingPayloadSchema>;
