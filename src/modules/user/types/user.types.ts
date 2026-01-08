import type { UserAttributes, UserStatus } from '@/shared/types';
export { UserStatus } from '@/shared/types';
export type {
  UserAttributes,
  UserCreationAttributes,
  UserPrivateResponse,
  UserPublicResponse,
} from '@/shared/types';

export interface UserWithContactInfo extends UserAttributes {
  isContact?: boolean;
  isBlocked?: boolean;
  isFavorite?: boolean;
  contactNickname?: string | null;
}

export interface UserSearchFilters {
  query?: string;
  status?: UserStatus;
  excludeUserId?: string;
  excludeBlocked?: boolean;
  onlyContacts?: boolean;
}

export interface UserSearchOptions {
  filters?: UserSearchFilters;
  limit?: number;
  offset?: number;
  orderBy?: 'username' | 'displayName' | 'lastSeenAt' | 'createdAt';
  order?: 'ASC' | 'DESC';
}

export interface UserSearchResult {
  users: UserWithContactInfo[];
  total: number;
  hasMore: boolean;
}

export interface UserPresence {
  userId: string;
  status: UserStatus;
  lastSeenAt: Date | null;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  lastSeenAt: Date | null;
  createdAt: Date;
}
