import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import {
  addContactSchema,
  contactIdParamSchema,
  listContactsSchema,
  updateContactSchema,
} from '../validation/contact.schemas';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';

export class ContactController {
  private readonly contacts: IContactService;

  constructor(contacts?: IContactService) {
    this.contacts = contacts ?? contactService;
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = listContactsSchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const { search, isBlocked, isFavorite, limit, offset, orderBy, order } = parsed.data;
    const result = await this.contacts.listContacts(userId, {
      filters: { search, isBlocked, isFavorite },
      limit,
      offset,
      orderBy,
      order,
    });

    res.status(HttpStatus.OK).json({ success: true, data: result });
  }

  async add(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = addContactSchema.safeParse(req.body);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const contact = await this.contacts.addContact(userId, parsed.data);

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: contact,
      message: 'Contato adicionado com sucesso',
    });
  }

  async listFavorites(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const favorites = await this.contacts.listFavorites(userId);

    res.status(HttpStatus.OK).json({ success: true, data: favorites });
  }

  async stats(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const stats = await this.contacts.getStats(userId);

    res.status(HttpStatus.OK).json({ success: true, data: stats });
  }

  async get(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = contactIdParamSchema.safeParse(req.params);

    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    const contact = await this.contacts.getContact(userId, params.data.contactId);

    res.status(HttpStatus.OK).json({ success: true, data: contact });
  }

  async update(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = contactIdParamSchema.safeParse(req.params);

    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    const body = updateContactSchema.safeParse(req.body);

    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const contact = await this.contacts.updateContact(userId, params.data.contactId, body.data);

    res.status(HttpStatus.OK).json({
      success: true,
      data: contact,
      message: 'Contato atualizado com sucesso',
    });
  }

  async remove(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = contactIdParamSchema.safeParse(req.params);

    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    await this.contacts.removeContact(userId, params.data.contactId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const contactController = new ContactController();
