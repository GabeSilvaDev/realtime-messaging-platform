export interface CreateUserDTO {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface UpdateUserDTO {
  username?: string;
  displayName?: string | null;
}

export interface UpdateProfileDTO {
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface UserResponseDTO {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface PublicUserDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  lastSeenAt: Date | null;
}

export interface UserSearchResultDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isContact: boolean;
  isBlocked: boolean;
}

import type { UserStatus } from '@/shared/types';

export interface UserListFilters {
  search?: string;
  status?: UserStatus;
  excludeIds?: string[];
}

export interface UserListOptions {
  filters?: UserListFilters;
  orderBy?: 'username' | 'displayName' | 'createdAt' | 'lastSeenAt';
  order?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface PaginatedUsers {
  users: PublicUserDTO[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AddContactDTO {
  contactId: string;
  nickname?: string;
}

export interface UpdateContactDTO {
  nickname?: string | null;
  isFavorite?: boolean;
}

export interface ContactResponseDTO {
  id: string;
  userId: string;
  contactId: string;
  nickname: string | null;
  isBlocked: boolean;
  isFavorite: boolean;
  blockedAt: Date | null;
  createdAt: Date;
  contact: PublicUserDTO;
}

export interface BlockUserDTO {
  userId: string;
}

export interface UnblockUserDTO {
  userId: string;
}
