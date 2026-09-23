import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import { searchUsersForContactSchema } from '../validation/contact.schemas';
import { getAuthenticatedUserId, sendValidationError } from './helpers';

export class UserController {
  private readonly contacts: IContactService;

  constructor(contacts?: IContactService) {
    this.contacts = contacts ?? contactService;
  }

  async search(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = searchUsersForContactSchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const { query, limit, excludeBlocked = true } = parsed.data;
    const users = await this.contacts.searchUsers(userId, query, { limit, excludeBlocked });

    res.status(HttpStatus.OK).json({ success: true, data: users });
  }
}

export const userController = new UserController();
