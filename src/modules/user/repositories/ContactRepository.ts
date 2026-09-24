import User from '@/shared/database/models/User';
import { escapeLikePattern } from '@/shared/utils/sql';
import { Op, type Order } from 'sequelize';
import Contact from '../models/Contact';
import type { IContactRepository } from '../interfaces';
import type {
  BlockResult,
  ContactAttributes,
  ContactCreationAttributes,
  ContactListOptions,
  ContactStats,
  ContactWithUser,
  PaginatedContacts,
} from '../types';

export type { IContactRepository } from '../interfaces';

/**
 * `lastInteraction` não é coluna: mapeia para `last_interaction_at` com NULLS LAST (quem nunca
 * conversou vai para o fim) e desempata pelos contatos mais recentes.
 */
function buildContactOrder(
  orderBy: NonNullable<ContactListOptions['orderBy']>,
  order: NonNullable<ContactListOptions['order']>
): Order {
  if (orderBy === 'lastInteraction') {
    return [
      ['lastInteractionAt', `${order} NULLS LAST`],
      ['createdAt', 'DESC'],
    ];
  }
  return [[orderBy, order]];
}

/** Atributos do usuário do contato incluídos nas listagens. */
const CONTACT_USER_ATTRIBUTES = [
  'id',
  'username',
  'displayName',
  'avatarUrl',
  'status',
  'lastSeenAt',
];

/** Linha de contato + usuário público (placeholder se o usuário não veio no include). */
function toContactWithUser(row: Contact): ContactWithUser {
  return {
    ...row.toJSON(),
    contact: row.contact?.toPublicJSON() ?? {
      id: row.contactId,
      username: '',
      displayName: null,
      avatarUrl: null,
      status: 'offline',
      lastSeenAt: null,
    },
  };
}

export class ContactRepository implements IContactRepository {
  async findById(id: string): Promise<ContactAttributes | null> {
    const contact = await Contact.findByPk(id);
    return contact?.toJSON() ?? null;
  }

  async findByUserAndContact(userId: string, contactId: string): Promise<ContactAttributes | null> {
    const contact = await Contact.findOne({
      where: { userId, contactId },
    });
    return contact?.toJSON() ?? null;
  }

  async findAllByUser(
    userId: string,
    options: ContactListOptions = {}
  ): Promise<PaginatedContacts> {
    const { filters = {}, orderBy = 'createdAt', order = 'DESC', limit = 50, offset = 0 } = options;

    const where: Record<string, unknown> = { userId };

    where.isBlocked = filters.isBlocked ?? false;

    if (filters.isFavorite !== undefined) {
      where.isFavorite = filters.isFavorite;
    }

    const include = [
      {
        model: User,
        as: 'contact',
        attributes: CONTACT_USER_ATTRIBUTES,
        where:
          filters.search !== undefined && filters.search !== ''
            ? {
                [Op.or]: [
                  { username: { [Op.iLike]: `%${escapeLikePattern(filters.search)}%` } },
                  { displayName: { [Op.iLike]: `%${escapeLikePattern(filters.search)}%` } },
                ],
              }
            : undefined,
      },
    ];

    const { count, rows } = await Contact.findAndCountAll({
      where,
      include,
      limit: limit + 1,
      offset,
      order: buildContactOrder(orderBy, order),
    });

    const hasMore = rows.length > limit;
    const contacts = rows.slice(0, limit);

    return {
      contacts: contacts.map(toContactWithUser),
      total: count,
      limit,
      offset,
      hasMore,
    };
  }

  async findBlockedByUser(userId: string): Promise<ContactWithUser[]> {
    const contacts = await Contact.findAll({
      where: { userId, isBlocked: true },
      include: [
        {
          model: User,
          as: 'contact',
          attributes: CONTACT_USER_ATTRIBUTES,
        },
      ],
      order: [['blockedAt', 'DESC']],
    });

    return contacts.map(toContactWithUser);
  }

  async findFavoritesByUser(userId: string): Promise<ContactWithUser[]> {
    const contacts = await Contact.findAll({
      where: { userId, isFavorite: true, isBlocked: false },
      include: [
        {
          model: User,
          as: 'contact',
          attributes: CONTACT_USER_ATTRIBUTES,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return contacts.map(toContactWithUser);
  }

  async create(data: ContactCreationAttributes): Promise<ContactAttributes> {
    const contact = await Contact.create(data);
    return contact.toJSON();
  }

  async update(id: string, data: Partial<ContactAttributes>): Promise<ContactAttributes | null> {
    const contact = await Contact.findByPk(id);
    if (!contact) {
      return null;
    }

    await contact.update(data);
    return contact.toJSON();
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await Contact.destroy({ where: { id } });
    return deleted > 0;
  }

  async deleteByUserAndContact(userId: string, contactId: string): Promise<boolean> {
    const deleted = await Contact.destroy({ where: { userId, contactId } });
    return deleted > 0;
  }

  async isBlocked(userId: string, targetId: string): Promise<boolean> {
    const contact = await Contact.findOne({
      where: { userId, contactId: targetId, isBlocked: true },
    });
    return contact !== null;
  }

  async isContact(userId: string, contactId: string): Promise<boolean> {
    const contact = await Contact.findOne({
      where: { userId, contactId, isBlocked: false },
    });
    return contact !== null;
  }

  async getStats(userId: string): Promise<ContactStats> {
    const [total, favorites, blocked] = await Promise.all([
      Contact.count({ where: { userId, isBlocked: false } }),
      Contact.count({ where: { userId, isFavorite: true, isBlocked: false } }),
      Contact.count({ where: { userId, isBlocked: true } }),
    ]);

    return { total, favorites, blocked };
  }

  /**
   * Bloqueia `contactId` para `userId`. `changed` só é `true` para quem de fato criou a linha
   * ou a virou de não bloqueada para bloqueada (UPDATE condicional em `is_blocked = false`),
   * o que evita eventos duplicados quando duas requisições bloqueiam ao mesmo tempo.
   */
  async block(userId: string, contactId: string): Promise<BlockResult> {
    const blockedAt = new Date();
    const [contact, created] = await Contact.findOrCreate({
      where: { userId, contactId },
      defaults: {
        userId,
        contactId,
        isBlocked: true,
        blockedAt,
        createdByBlock: true,
      },
    });

    if (created) {
      return { contact: contact.toJSON(), changed: true };
    }

    const [affected] = await Contact.update(
      { isBlocked: true, blockedAt },
      { where: { id: contact.id, isBlocked: false } }
    );

    if (affected > 0) {
      await contact.reload();
    }

    return { contact: contact.toJSON(), changed: affected > 0 };
  }

  /**
   * Remove o bloqueio. A linha criada só pelo bloqueio é apagada; um contato pré-existente
   * volta a não bloqueado. Retorna `true` apenas se esta chamada alterou alguma linha
   * (contagem de linhas afetadas), o que torna o desbloqueio seguro sob concorrência.
   */
  async unblock(userId: string, contactId: string): Promise<boolean> {
    const destroyed = await Contact.destroy({
      where: { userId, contactId, isBlocked: true, createdByBlock: true },
    });

    if (destroyed > 0) {
      return true;
    }

    const [affected] = await Contact.update(
      { isBlocked: false, blockedAt: null },
      { where: { userId, contactId, isBlocked: true } }
    );

    return affected > 0;
  }

  async listWatcherIds(userId: string): Promise<string[]> {
    const rows = await Contact.findAll({
      where: { contactId: userId, isBlocked: false },
      attributes: ['userId'],
    });
    return rows.map((row) => row.userId);
  }

  async listContactIds(userId: string): Promise<string[]> {
    const rows = await Contact.findAll({
      where: { userId, isBlocked: false },
      attributes: ['contactId'],
    });
    return rows.map((row) => row.contactId);
  }

  async listBlockedEitherIds(userId: string): Promise<string[]> {
    const rows = await Contact.findAll({
      where: { isBlocked: true, [Op.or]: [{ userId }, { contactId: userId }] },
      attributes: ['userId', 'contactId'],
    });
    return [...new Set(rows.map((row) => (row.userId === userId ? row.contactId : row.userId)))];
  }

  async findByUserAndContactIds(userId: string, contactIds: string[]): Promise<ContactWithUser[]> {
    if (contactIds.length === 0) {
      return [];
    }
    const rows = await Contact.findAll({
      where: { userId, contactId: { [Op.in]: contactIds }, isBlocked: false },
      include: [{ model: User, as: 'contact', attributes: CONTACT_USER_ATTRIBUTES }],
    });
    return rows.map(toContactWithUser);
  }

  async touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void> {
    await Contact.update(
      { lastInteractionAt: at },
      {
        where: {
          [Op.or]: [
            { userId, contactId: otherUserId },
            { userId: otherUserId, contactId: userId },
          ],
        },
        silent: true,
      }
    );
  }
}

export const contactRepository = new ContactRepository();
