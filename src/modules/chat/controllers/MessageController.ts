import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';
import { CHAT_CONSTANTS } from '../constants';
import type { IMessageService } from '../interfaces';
import { messageService } from '../services/MessageService';
import type { MessageMetadata } from '../types';
import {
  listMessagesQuerySchema,
  markReadSchema,
  messageParamSchema,
  sendMessageSchema,
} from '../validation/chat.schemas';
import { parseConversationId } from './params';

function extractMetadata(req: Request): MessageMetadata {
  const userAgent = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    device: userAgent === undefined ? null : userAgent.slice(0, CHAT_CONSTANTS.MAX_DEVICE_LENGTH),
  };
}

export class MessageController {
  private readonly messages: IMessageService;

  constructor(messages?: IMessageService) {
    this.messages = messages ?? messageService;
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const query = listMessagesQuerySchema.safeParse(req.query);
    if (!query.success) {
      sendValidationError(res, query.error.issues);
      return;
    }

    const page = await this.messages.list(userId, conversationId, query.data);

    res.status(HttpStatus.OK).json({ success: true, data: page });
  }

  async send(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const body = sendMessageSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const message = await this.messages.send(
      userId,
      conversationId,
      body.data,
      extractMetadata(req)
    );

    res.status(HttpStatus.CREATED).json({ success: true, data: message });
  }

  /** Marca como lido tudo de outros autores até `messageId` (equivalente REST de `message:read`). */
  async markRead(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const body = markReadSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    await this.messages.markRead(userId, conversationId, body.data.messageId);

    res.status(HttpStatus.NO_CONTENT).send();
  }

  async delete(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = messageParamSchema.safeParse(req.params);
    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    await this.messages.delete(userId, params.data.id, params.data.messageId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const messageController = new MessageController();
