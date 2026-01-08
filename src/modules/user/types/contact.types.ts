export interface ContactAttributes {
  id: string;
  userId: string;
  contactId: string;
  nickname: string | null;
  isBlocked: boolean;
  isFavorite: boolean;
  blockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactCreationAttributes {
  userId: string;
  contactId: string;
  nickname?: string | null;
  isBlocked?: boolean;
  isFavorite?: boolean;
  blockedAt?: Date | null;
}

export interface ContactWithUser extends ContactAttributes {
  contact: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
    lastSeenAt: Date | null;
  };
}

export interface ContactListFilters {
  isBlocked?: boolean;
  isFavorite?: boolean;
  search?: string;
}

export interface ContactListOptions {
  filters?: ContactListFilters;
  orderBy?: 'nickname' | 'createdAt' | 'lastInteraction';
  order?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface PaginatedContacts {
  contacts: ContactWithUser[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface BlockedUser {
  id: string;
  userId: string;
  blockedUserId: string;
  blockedAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface ContactStats {
  total: number;
  favorites: number;
  blocked: number;
}
