import type { UserAttributes } from '@/shared/types';

export interface IUserRepository {
  findById(id: string): Promise<UserAttributes | null>;
  findByEmail(email: string): Promise<UserAttributes | null>;
  findByUsername(username: string): Promise<UserAttributes | null>;
  create(data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<UserAttributes>;
  updatePassword(userId: string, password: string): Promise<void>;
}
