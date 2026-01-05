import { sequelize } from '@/shared/database';
import type { UserAttributes } from '@/shared/types';
import type { ModelStatic, Model } from 'sequelize';
import type { IUserRepository } from '../interfaces';

export class UserRepository implements IUserRepository {
  private get User(): ModelStatic<Model> | undefined {
    return sequelize.models.User;
  }

  async findById(id: string): Promise<UserAttributes | null> {
    const user = await this.User?.findByPk(id);
    return user?.get() as UserAttributes | null;
  }

  async findByEmail(email: string): Promise<UserAttributes | null> {
    const user = await this.User?.findOne({ where: { email } });
    return user?.get() as UserAttributes | null;
  }

  async findByUsername(username: string): Promise<UserAttributes | null> {
    const user = await this.User?.findOne({ where: { username } });
    return user?.get() as UserAttributes | null;
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<UserAttributes> {
    const user = await this.User?.create(data);
    return user?.get() as UserAttributes;
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    await this.User?.update({ password }, { where: { id: userId } });
  }
}

export const userRepository = new UserRepository();
