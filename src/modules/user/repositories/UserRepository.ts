import User from '@/shared/database/models/User';
import type { UserAttributes, UserStatus } from '@/shared/types';
import { Op } from 'sequelize';
import type { IUserRepository } from '../interfaces';
import Contact from '../models/Contact';
import type { UserSearchOptions, UserSearchResult, UserWithContactInfo } from '../types';

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<UserAttributes | null> {
    const user = await User.findByPk(id);
    return user?.get() ?? null;
  }

  async findByEmail(email: string): Promise<UserAttributes | null> {
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    return user?.get() ?? null;
  }

  async findByUsername(username: string): Promise<UserAttributes | null> {
    const user = await User.findOne({ where: { username: username.toLowerCase() } });
    return user?.get() ?? null;
  }

  async findByIds(ids: string[]): Promise<UserAttributes[]> {
    if (ids.length === 0) {
      return [];
    }
    const users = await User.findAll({ where: { id: { [Op.in]: ids } } });
    return users.map((u) => u.get());
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<UserAttributes> {
    const user = await User.create({
      ...data,
      email: data.email.toLowerCase(),
      username: data.username.toLowerCase(),
    });
    return user.get();
  }

  async update(id: string, data: Partial<UserAttributes>): Promise<UserAttributes | null> {
    const user = await User.findByPk(id);
    if (!user) {
      return null;
    }

    await user.update(data);
    return user.get();
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    await User.update({ password }, { where: { id: userId } });
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await User.destroy({ where: { id } });
    return deleted > 0;
  }

  async search(options: UserSearchOptions): Promise<UserSearchResult> {
    const { filters = {}, limit = 20, offset = 0, orderBy = 'username', order = 'ASC' } = options;

    const where: Record<string, unknown> = {};

    if (filters.query !== undefined && filters.query !== '') {
      where[Op.or as unknown as string] = [
        { username: { [Op.iLike]: `%${filters.query}%` } },
        { displayName: { [Op.iLike]: `%${filters.query}%` } },
        { email: { [Op.iLike]: `%${filters.query}%` } },
      ];
    }

    if (filters.status !== undefined) {
      where.status = filters.status;
    }

    if (filters.excludeUserId !== undefined) {
      where.id = { [Op.ne]: filters.excludeUserId };
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      limit: limit + 1,
      offset,
      order: [[orderBy, order]],
      attributes: { exclude: ['password'] },
    });

    const hasMore = rows.length > limit;
    const users = rows.slice(0, limit);

    let contactsMap = new Map<string, Contact>();
    if (filters.excludeUserId !== undefined) {
      const contacts = await Contact.findAll({
        where: { userId: filters.excludeUserId },
      });
      contactsMap = new Map(contacts.map((c) => [c.contactId, c]));
    }

    const usersWithContactInfo: UserWithContactInfo[] = users.map((user) => {
      const contact = contactsMap.get(user.id);
      return {
        ...user.get(),
        isContact: !!contact,
        isBlocked: contact?.isBlocked ?? false,
        isFavorite: contact?.isFavorite ?? false,
        contactNickname: contact?.nickname ?? null,
      };
    });

    const filteredUsers =
      filters.excludeBlocked === true
        ? usersWithContactInfo.filter((u) => u.isBlocked === false)
        : usersWithContactInfo;

    const finalUsers =
      filters.onlyContacts === true
        ? filteredUsers.filter((u) => u.isContact === true)
        : filteredUsers;

    return {
      users: finalUsers,
      total: count,
      hasMore,
    };
  }

  async updateLastSeen(userId: string): Promise<void> {
    await User.update({ lastSeenAt: new Date() }, { where: { id: userId } });
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await User.update({ status, lastSeenAt: new Date() }, { where: { id: userId } });
  }
}

export const userRepository = new UserRepository();
