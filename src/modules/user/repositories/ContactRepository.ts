import User from '@/shared/database/models/User';
import { Op } from 'sequelize';
import Contact from '../models/Contact';
import type { IContactRepository } from '../interfaces';
import type {
  ContactAttributes,
  ContactCreationAttributes,
  ContactListOptions,
  ContactStats,
  ContactWithUser,
  PaginatedContacts,
} from '../types';

export type { IContactRepository } from '../interfaces';

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

    if (filters.isBlocked !== undefined) {
      where.isBlocked = filters.isBlocked;
    }

    if (filters.isFavorite !== undefined) {
      where.isFavorite = filters.isFavorite;
    }

    const include = [
      {
        model: User,
        as: 'contact',
        attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status', 'lastSeenAt'],
        where:
          filters.search !== undefined && filters.search !== ''
            ? {
                [Op.or]: [
                  { username: { [Op.iLike]: `%${filters.search}%` } },
                  { displayName: { [Op.iLike]: `%${filters.search}%` } },
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
      order: [[orderBy, order]],
    });

    const hasMore = rows.length > limit;
    const contacts = rows.slice(0, limit);

    return {
      contacts: contacts.map((c) => ({
        ...c.toJSON(),
        contact: c.contact?.toPublicJSON() ?? {
          id: c.contactId,
          username: '',
          displayName: null,
          avatarUrl: null,
          status: 'offline',
          lastSeenAt: null,
        },
      })) as ContactWithUser[],
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
          attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status', 'lastSeenAt'],
        },
      ],
      order: [['blockedAt', 'DESC']],
    });

    return contacts.map((c) => ({
      ...c.toJSON(),
      contact: c.contact?.toPublicJSON() ?? {
        id: c.contactId,
        username: '',
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
      },
    })) as ContactWithUser[];
  }

  async findFavoritesByUser(userId: string): Promise<ContactWithUser[]> {
    const contacts = await Contact.findAll({
      where: { userId, isFavorite: true, isBlocked: false },
      include: [
        {
          model: User,
          as: 'contact',
          attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status', 'lastSeenAt'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return contacts.map((c) => ({
      ...c.toJSON(),
      contact: c.contact?.toPublicJSON() ?? {
        id: c.contactId,
        username: '',
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
      },
    })) as ContactWithUser[];
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
      where: { userId, contactId },
    });
    return contact !== null;
  }

  async getStats(userId: string): Promise<ContactStats> {
    const [total, favorites, blocked] = await Promise.all([
      Contact.count({ where: { userId } }),
      Contact.count({ where: { userId, isFavorite: true } }),
      Contact.count({ where: { userId, isBlocked: true } }),
    ]);

    return { total, favorites, blocked };
  }

  async block(userId: string, contactId: string): Promise<ContactAttributes> {
    const [contact, created] = await Contact.findOrCreate({
      where: { userId, contactId },
      defaults: {
        userId,
        contactId,
        isBlocked: true,
        blockedAt: new Date(),
      },
    });

    if (!created && !contact.isBlocked) {
      await contact.update({
        isBlocked: true,
        blockedAt: new Date(),
      });
    }

    return contact.toJSON();
  }

  async unblock(userId: string, contactId: string): Promise<boolean> {
    const contact = await Contact.findOne({
      where: { userId, contactId, isBlocked: true },
    });

    if (!contact) {
      return false;
    }

    await contact.update({
      isBlocked: false,
      blockedAt: null,
    });

    return true;
  }
}

export const contactRepository = new ContactRepository();
