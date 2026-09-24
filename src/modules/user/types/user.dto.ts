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

/**
 * Perfil público INTERNO (cache `cache:user:<id>`, `userService.getMultiple`): inclui `status` e
 * `lastSeenAt` porque a presença lê o `last_seen_at` daqui. Nunca é serializado para outro
 * usuário — respostas sobre outros usuários usam `UserSummaryDTO` (a presença é a única fonte
 * do estado e do visto por último, e ela esconde pares bloqueados).
 */
export interface PublicUserDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  lastSeenAt: Date | null;
}

/** Outro usuário como sai nas respostas (contatos, bloqueios, busca): sem status/lastSeenAt. */
export interface UserSummaryDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
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
  contact: UserSummaryDTO;
}

export interface BlockUserDTO {
  userId: string;
}

export interface UnblockUserDTO {
  userId: string;
}
