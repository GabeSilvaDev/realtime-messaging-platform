import type { UserAttributes } from '@/shared/types';
import User from '@/shared/database/models/User';
import type { IUserRepository } from '../interfaces';

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<UserAttributes | null> {
    const user = await User.findByPk(id);
    if (!user) {
      return null;
    }
    return user.get();
  }

  async findByEmail(email: string): Promise<UserAttributes | null> {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return null;
    }
    return user.get();
  }

  async findByUsername(username: string): Promise<UserAttributes | null> {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return null;
    }
    return user.get();
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<UserAttributes> {
    const user = await User.create(data);
    return user.get();
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    await User.update({ password }, { where: { id: userId } });
  }
}

export const userRepository = new UserRepository();
