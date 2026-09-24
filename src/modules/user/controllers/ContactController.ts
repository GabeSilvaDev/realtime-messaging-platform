import type { Request, Response } from 'express';
import { compareByPresence } from '@/modules/presence/constants';
import type { IPresenceService } from '@/modules/presence/interfaces';
import { presenceService } from '@/modules/presence/services/PresenceService';
import { HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import type { PresenceStateDTO } from '@/shared/types';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import type { ContactPresence, ContactWithPresence, ContactWithUser } from '../types';
import {
  addContactSchema,
  contactIdParamSchema,
  listContactsSchema,
  updateContactSchema,
} from '../validation/contact.schemas';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';

const OFFLINE: ContactPresence = { state: 'offline', lastSeenAt: null };

/** Nome exibido do contato: apelido, nome de exibição ou username. */
function contactName(contact: ContactWithUser): string {
  return contact.nickname ?? contact.contact.displayName ?? contact.contact.username;
}

export class ContactController {
  private readonly contacts: IContactService;
  private readonly presence: Pick<IPresenceService, 'getVisibleStates'>;

  constructor(contacts?: IContactService, presence?: Pick<IPresenceService, 'getVisibleStates'>) {
    this.contacts = contacts ?? contactService;
    this.presence = presence ?? presenceService;
  }

  /**
   * Página de contatos com `presence: { state, lastSeenAt }` em cada item. `orderBy=presence`
   * ordena a PÁGINA carregada (o banco ordena por `createdAt`); para a lista completa de quem
   * está conectado, `GET /contacts/online`.
   *
   * A listagem não depende do Redis: se a presença falhar, loga `warn` e responde os contatos com
   * `presence: null` (na ordem do banco, mesmo com `orderBy=presence`). Os endpoints da presença
   * (`GET /contacts/online`, `GET /api/presence`) continuam exigindo o Redis.
   */
  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = listContactsSchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const { search, isBlocked, isFavorite, limit, offset, orderBy, order } = parsed.data;
    const byPresence = orderBy === 'presence';
    const result = await this.contacts.listContacts(userId, {
      filters: { search, isBlocked, isFavorite },
      limit,
      offset,
      orderBy: byPresence ? undefined : orderBy,
      order,
    });

    let contacts: ContactWithPresence[];
    try {
      const states = await this.presence.getVisibleStates(
        userId,
        result.contacts.map((contact) => contact.contactId)
      );
      const withStates = withPresence(result.contacts, states);
      if (byPresence) {
        withStates.sort((a, b) => compareByPresence(a.presence, b.presence));
      }
      contacts = withStates;
    } catch (error) {
      logger.warn('Presença indisponível; contatos listados sem presence', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      contacts = result.contacts.map((contact) => ({ ...contact, presence: null }));
    }

    res.status(HttpStatus.OK).json({ success: true, data: { ...result, contacts } });
  }

  /** Contatos (não bloqueados) conectados — online, ausente ou ocupado —, ordenados por nome. */
  async online(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const states = await this.presence.getVisibleStates(
      userId,
      await this.contacts.listContactIds(userId)
    );
    const connected = states.filter(({ state }) => state !== 'offline');
    const contacts = await this.contacts.getContactsByIds(
      userId,
      connected.map((entry) => entry.userId)
    );

    const items = withPresence(contacts, connected).sort((a, b) =>
      contactName(a).localeCompare(contactName(b), 'pt-BR', { sensitivity: 'base' })
    );

    res.status(HttpStatus.OK).json({ success: true, data: items });
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

/** Anexa a presença a cada contato; sem estado conhecido, `offline`. */
function withPresence(
  contacts: ContactWithUser[],
  states: PresenceStateDTO[]
): (ContactWithUser & { presence: ContactPresence })[] {
  const byId = new Map(
    states.map(({ userId, state, lastSeenAt }) => [userId, { state, lastSeenAt }])
  );
  return contacts.map((contact) => ({
    ...contact,
    presence: byId.get(contact.contactId) ?? OFFLINE,
  }));
}

export const contactController = new ContactController();
