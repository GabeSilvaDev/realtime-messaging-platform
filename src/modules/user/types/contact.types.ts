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

/**
 * Atributos persistidos do model `Contact`, incluindo campos internos que não são expostos
 * pela API (`toJSON()` devolve apenas `ContactAttributes`).
 */
export interface ContactModelAttributes extends ContactAttributes {
  createdByBlock: boolean;
}

export interface ContactCreationAttributes {
  userId: string;
  contactId: string;
  nickname?: string | null;
  isBlocked?: boolean;
  isFavorite?: boolean;
  blockedAt?: Date | null;
  createdByBlock?: boolean;
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
