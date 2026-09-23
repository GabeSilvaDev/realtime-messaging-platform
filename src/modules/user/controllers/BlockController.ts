import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import { blockUserSchema } from '../validation/contact.schemas';
import { userIdParamSchema } from '../validation/user.schemas';
import { getAuthenticatedUserId, sendValidationError } from './helpers';

export class BlockController {
  private readonly contacts: IContactService;

  constructor(contacts?: IContactService) {
    this.contacts = contacts ?? contactService;
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const blocked = await this.contacts.listBlocked(userId);

    res.status(HttpStatus.OK).json({ success: true, data: blocked });
  }

  async block(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = blockUserSchema.safeParse(req.body);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    await this.contacts.blockUser(userId, parsed.data.userId);

    res.status(HttpStatus.CREATED).json({
      success: true,
      message: 'Usuário bloqueado com sucesso',
    });
  }

  async unblock(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = userIdParamSchema.safeParse(req.params);

    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    await this.contacts.unblockUser(userId, params.data.userId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const blockController = new BlockController();
