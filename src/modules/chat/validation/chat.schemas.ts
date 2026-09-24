import { z } from 'zod';
import { CHAT_CONSTANTS } from '../constants';

/** UUID normalizado em minúsculas (a direct_key e as comparações de ids dependem disso). */
const uuid = (message: string): z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>> =>
  z.uuid({ message }).transform((value) => value.toLowerCase());

const objectId = (message: string): z.ZodString => z.string().regex(/^[a-f\d]{24}$/i, { message });

const conversationName = z
  .string()
  .trim()
  .min(
    CHAT_CONSTANTS.MIN_CONVERSATION_NAME_LENGTH,
    `Nome deve ter no mínimo ${String(CHAT_CONSTANTS.MIN_CONVERSATION_NAME_LENGTH)} caractere`
  )
  .max(
    CHAT_CONSTANTS.MAX_CONVERSATION_NAME_LENGTH,
    `Nome deve ter no máximo ${String(CHAT_CONSTANTS.MAX_CONVERSATION_NAME_LENGTH)} caracteres`
  );

const userIdList = z
  .array(uuid('ID de usuário inválido'))
  .min(1, 'Informe ao menos um usuário')
  .max(
    CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS,
    `Máximo de ${String(CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS)} usuários`
  );

export const conversationIdParamSchema = z.object({
  id: uuid('ID de conversa inválido'),
});

export const memberParamSchema = z.object({
  id: uuid('ID de conversa inválido'),
  userId: uuid('ID de usuário inválido'),
});

export const messageParamSchema = z.object({
  id: uuid('ID de conversa inválido'),
  messageId: objectId('ID de mensagem inválido'),
});

export const createDirectConversationSchema = z.object({
  userId: uuid('ID de usuário inválido'),
});

export const createGroupConversationSchema = z.object({
  name: conversationName,
  participantIds: userIdList,
});

export const renameConversationSchema = z.object({
  name: conversationName,
});

export const addMembersSchema = z.object({
  userIds: userIdList,
});

export const listConversationsQuerySchema = z.object({
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHAT_CONSTANTS.MAX_CONVERSATION_LIMIT)
    .optional()
    .default(CHAT_CONSTANTS.DEFAULT_CONVERSATION_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHAT_CONSTANTS.MESSAGE_PAGE_SIZE)
    .optional()
    .default(CHAT_CONSTANTS.MESSAGE_PAGE_SIZE),
  before: objectId('Cursor inválido').optional(),
});

export const sendMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Mensagem não pode estar vazia')
    .max(
      CHAT_CONSTANTS.MAX_MESSAGE_LENGTH,
      `Mensagem deve ter no máximo ${String(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH)} caracteres`
    ),
  replyTo: objectId('ID de mensagem inválido').optional(),
  mentions: z
    .array(uuid('ID de usuário inválido'))
    .max(
      CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS,
      `Máximo de ${String(CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS)} menções`
    )
    .optional(),
  clientMessageId: uuid('clientMessageId inválido').optional(),
});

export const markReadSchema = z.object({
  messageId: objectId('ID de mensagem inválido'),
});

export type CreateDirectConversationInput = z.infer<typeof createDirectConversationSchema>;
export type CreateGroupConversationInput = z.infer<typeof createGroupConversationSchema>;
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;
export type AddMembersInput = z.infer<typeof addMembersSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
