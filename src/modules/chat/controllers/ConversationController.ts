import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';
import type { IConversationService } from '../interfaces';
import { conversationService } from '../services/ConversationService';
import {
  addMembersSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  listConversationsQuerySchema,
  memberParamSchema,
  renameConversationSchema,
} from '../validation/chat.schemas';
import { parseConversationId } from './params';

export class ConversationController {
  private readonly conversations: IConversationService;

  constructor(conversations?: IConversationService) {
    this.conversations = conversations ?? conversationService;
  }

  async createDirect(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const body = createDirectConversationSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const { conversation, created } = await this.conversations.createDirect(
      userId,
      body.data.userId
    );

    res
      .status(created ? HttpStatus.CREATED : HttpStatus.OK)
      .json({ success: true, data: conversation });
  }

  async createGroup(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const body = createGroupConversationSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const conversation = await this.conversations.createGroup(userId, body.data);

    res.status(HttpStatus.CREATED).json({ success: true, data: conversation });
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const query = listConversationsQuerySchema.safeParse(req.query);
    if (!query.success) {
      sendValidationError(res, query.error.issues);
      return;
    }

    const page = await this.conversations.list(userId, query.data);

    res.status(HttpStatus.OK).json({ success: true, data: page });
  }

  async get(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const conversation = await this.conversations.get(userId, conversationId);

    res.status(HttpStatus.OK).json({ success: true, data: conversation });
  }

  async rename(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const body = renameConversationSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const conversation = await this.conversations.rename(userId, conversationId, body.data.name);

    res.status(HttpStatus.OK).json({ success: true, data: conversation });
  }

  async archive(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    await this.conversations.archive(userId, conversationId);

    res.status(HttpStatus.NO_CONTENT).send();
  }

  async unarchive(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    await this.conversations.unarchive(userId, conversationId);

    res.status(HttpStatus.NO_CONTENT).send();
  }

  async leave(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    await this.conversations.leave(userId, conversationId);

    res.status(HttpStatus.NO_CONTENT).send();
  }

  async addMembers(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const body = addMembersSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const conversation = await this.conversations.addMembers(
      userId,
      conversationId,
      body.data.userIds
    );

    res.status(HttpStatus.OK).json({ success: true, data: conversation });
  }

  async removeMember(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = memberParamSchema.safeParse(req.params);
    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    await this.conversations.removeMember(userId, params.data.id, params.data.userId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const conversationController = new ConversationController();
