import type { UserAttributes, UserStatus } from '@/shared/types';
import type { UserSearchOptions, UserSearchResult } from '../types';

export interface IUserRepository {
  findById(id: string): Promise<UserAttributes | null>;
  findByEmail(email: string): Promise<UserAttributes | null>;
  findByUsername(username: string): Promise<UserAttributes | null>;
  findByIds(ids: string[]): Promise<UserAttributes[]>;
  create(data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<UserAttributes>;
  update(id: string, data: Partial<UserAttributes>): Promise<UserAttributes | null>;
  updatePassword(userId: string, password: string): Promise<void>;
  delete(id: string): Promise<boolean>;
  search(options: UserSearchOptions): Promise<UserSearchResult>;
  updateLastSeen(userId: string): Promise<void>;
  updateStatus(userId: string, status: UserStatus): Promise<void>;
}
