import type { UserStatus } from '@/shared/types';
import type {
  CreateUserDTO,
  PaginatedUsers,
  PublicUserDTO,
  UpdateUserDTO,
  UserListOptions,
  UserResponseDTO,
  UserSearchOptions,
  UserSearchResult,
} from '../types';

export interface IUserService {
  findById(id: string): Promise<UserResponseDTO>;
  findByIdPublic(id: string): Promise<PublicUserDTO>;
  findByEmail(email: string): Promise<UserResponseDTO | null>;
  findByUsername(username: string): Promise<PublicUserDTO | null>;
  create(data: CreateUserDTO): Promise<UserResponseDTO>;
  update(id: string, data: UpdateUserDTO): Promise<UserResponseDTO>;
  delete(id: string, requestingUserId?: string): Promise<void>;
  search(options: UserSearchOptions): Promise<UserSearchResult>;
  list(options?: UserListOptions): Promise<PaginatedUsers>;
  exists(id: string): Promise<boolean>;
  updateLastSeen(userId: string): Promise<void>;
  updateStatus(userId: string, status: UserStatus): Promise<void>;
  getMultiple(ids: string[]): Promise<PublicUserDTO[]>;
}
