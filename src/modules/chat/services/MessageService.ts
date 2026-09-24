import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { CHAT_CONSTANTS } from '../constants';
import {
  ClientMessageIdConflictException,
  ConversationBlockedException,
  ConversationNotFoundException,
  InvalidMentionsException,
  MessageNotFoundException,
  NotMessageAuthorException,
} from '../errors';
import type {
  IConversationRepository,
  IMessageRepository,
  IMessageService,
  IParticipantRepository,
} from '../interfaces';
import { conversationRepository, messageRepository, participantRepository } from '../repositories';
import { ParticipantDirectory } from './ParticipantDirectory';
import type {
  ListMessagesOptions,
  MessageCursor,
  MessageDTO,
  MessageMetadata,
  MessageRecord,
  PaginatedMessages,
  SendMessageDTO,
} from '../types';

/**
 * Mensagem apagada vira tombstone: mantém id/datas/status (preserva threads e confirmações),
 * esconde o conteúdo.
 */
function toMessageDTO(record: MessageRecord): MessageDTO {
  const deleted = record.deletedAt !== null;
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    content: deleted ? null : record.content,
    replyTo: record.replyTo,
    mentions: deleted ? [] : record.mentions,
    clientMessageId: record.clientMessageId,
    status: {
      sentAt: record.createdAt,
      deliveredTo: record.deliveredTo,
      readBy: record.readBy,
    },
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Reenvio com `clientMessageId` já usado pelo remetente: devolve a mensagem original (sem novo
 * evento nem `last_message_at`). O mesmo id reaproveitado em outra conversa é conflito (409).
 */
function toReplay(existing: MessageRecord, conversationId: string): MessageDTO {
  if (existing.conversationId !== conversationId) {
    throw new ClientMessageIdConflictException();
  }
  return toMessageDTO(existing);
}

export class MessageService implements IMessageService {
  constructor(
    private readonly messages: IMessageRepository = messageRepository,
    private readonly conversations: IConversationRepository = conversationRepository,
    private readonly participants: IParticipantRepository = participantRepository,
    private readonly contacts: Pick<IContactService, 'isBlockedByEither'> = contactService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus,
    private readonly directory: Pick<
      ParticipantDirectory,
      'userIds' | 'isParticipant' | 'forget'
    > = new ParticipantDirectory(participants)
  ) {}

  async send(
    userId: string,
    conversationId: string,
    data: SendMessageDTO,
    metadata: MessageMetadata
  ): Promise<MessageDTO> {
    const participantIds = await this.directory.userIds(conversationId);
    if (!participantIds.includes(userId)) {
      throw new ConversationNotFoundException();
    }

    const conversation = await this.conversations.findById(conversationId);
    if (conversation === null) {
      throw new ConversationNotFoundException();
    }

    const clientMessageId = data.clientMessageId ?? null;
    if (clientMessageId !== null) {
      const existing = await this.messages.findByClientMessageId(userId, clientMessageId);
      if (existing !== null) {
        return toReplay(existing, conversationId);
      }
    }

    if (conversation.type === 'direct') {
      const otherId = participantIds.find((id) => id !== userId);
      if (otherId !== undefined && (await this.contacts.isBlockedByEither(userId, otherId))) {
        throw new ConversationBlockedException();
      }
    }

    const replyTo = data.replyTo ?? null;
    if (replyTo !== null) {
      const original = await this.messages.findById(replyTo);
      if (original?.conversationId !== conversationId) {
        throw new MessageNotFoundException('Mensagem respondida não encontrada');
      }
    }

    const mentions = [...new Set(data.mentions ?? [])];
    if (mentions.some((id) => !participantIds.includes(id))) {
      throw new InvalidMentionsException();
    }

    const { record, created } = await this.messages.create({
      conversationId,
      senderId: userId,
      content: { type: 'text', text: data.text.trim() },
      replyTo,
      mentions,
      metadata,
      clientMessageId,
    });
    if (!created) {
      return toReplay(record, conversationId);
    }

    // Best-effort: falha em atualizar last_message_at não deve impedir o envio da mensagem.
    try {
      await this.conversations.touchLastMessageAt(conversationId, record.createdAt);
    } catch (error) {
      logger.warn('Falha ao atualizar last_message_at da conversa', {
        conversationId,
        messageId: record.id,
        error,
      });
    }

    const dto = toMessageDTO(record);

    await this.events.publish(ChatEvents.MESSAGE_SENT, {
      messageId: record.id,
      conversationId,
      conversationType: conversation.type,
      senderId: userId,
      text: record.content.text,
      mentions: record.mentions,
      replyTo: record.replyTo,
      createdAt: record.createdAt,
      participantIds,
      message: dto,
    });

    return dto;
  }

  async list(
    userId: string,
    conversationId: string,
    options: ListMessagesOptions = {}
  ): Promise<PaginatedMessages> {
    await this.requireParticipant(conversationId, userId);

    const pageSize = Math.max(
      1,
      Math.min(options.limit ?? CHAT_CONSTANTS.MESSAGE_PAGE_SIZE, CHAT_CONSTANTS.MESSAGE_PAGE_SIZE)
    );

    let before: MessageCursor | undefined;
    if (options.before !== undefined) {
      const cursor = await this.messages.findById(options.before);
      if (cursor?.conversationId !== conversationId) {
        throw new MessageNotFoundException();
      }
      before = { createdAt: cursor.createdAt, id: cursor.id };
    }

    const records = await this.messages.findByConversation(conversationId, {
      limit: pageSize,
      before,
    });

    // nextCursor = id da última mensagem da página, apenas quando a página veio cheia.
    const nextCursor =
      records.length === pageSize
        ? records.reduce<string | null>((_last, record) => record.id, null)
        : null;

    return { messages: records.map(toMessageDTO), nextCursor };
  }

  async delete(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.requireParticipant(conversationId, userId);
    const message = await this.requireMessage(conversationId, messageId);

    if (message.senderId !== userId) {
      throw new NotMessageAuthorException();
    }

    const deleted = await this.messages.softDelete(messageId, new Date());
    if (deleted) {
      await this.events.publish(ChatEvents.MESSAGE_DELETED, {
        messageId,
        conversationId,
        deletedBy: userId,
      });
    }
  }

  async markDelivered(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.requireParticipant(conversationId, userId);
    const message = await this.requireMessage(conversationId, messageId);

    if (message.senderId === userId) {
      return;
    }

    const at = new Date();
    const changed = await this.messages.markDelivered(messageId, userId, at);
    if (changed) {
      await this.events.publish(ChatEvents.MESSAGE_DELIVERED, {
        messageId,
        conversationId,
        userId,
        senderId: message.senderId,
        at,
      });
    }
  }

  async markRead(userId: string, conversationId: string, messageId: string): Promise<void> {
    // A linha da participação (e não o cache): `last_read_at` muda a cada leitura.
    const membership = await this.participants.find(conversationId, userId);
    if (membership === null) {
      throw new ConversationNotFoundException();
    }
    const message = await this.requireMessage(conversationId, messageId);

    // Tudo até `last_read_at` já foi marcado numa leitura anterior: a varredura começa ali
    // (inclusive — reler o alvo é idempotente). Mongo antes do Postgres: se a marcação falhar,
    // `last_read_at` não avança e a próxima leitura cobre o intervalo de novo.
    const at = new Date();
    const range = { from: membership.lastReadAt ?? new Date(0), upTo: message.createdAt };
    const marked = await this.messages.markReadUpTo(conversationId, userId, range, at);
    await this.participants.advanceLastReadAt(conversationId, userId, message.createdAt);

    if (marked > 0) {
      await this.events.publish(ChatEvents.MESSAGE_READ, {
        conversationId,
        userId,
        upToMessageId: messageId,
        at,
      });
    }
  }

  /** Mensagem inexistente ou de outra conversa → 404 (não revela mensagens alheias). */
  private async requireMessage(conversationId: string, messageId: string): Promise<MessageRecord> {
    const message = await this.messages.findById(messageId);
    if (message?.conversationId !== conversationId) {
      throw new MessageNotFoundException();
    }
    return message;
  }

  /** Não participante → 404 (consulta o cache de participantes). */
  private async requireParticipant(conversationId: string, userId: string): Promise<void> {
    if (!(await this.directory.isParticipant(conversationId, userId))) {
      throw new ConversationNotFoundException();
    }
  }
}

export const messageService = new MessageService();
