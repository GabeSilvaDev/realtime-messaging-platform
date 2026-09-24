import type { PresenceStateDTO } from '@/shared/types';
import type { UserSummaryDTO } from './user.dto';

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
  lastInteractionAt: Date | null;
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

/** Contato + usuário do contato (sem status/lastSeenAt: o estado vem só da presença). */
export interface ContactWithUser extends ContactAttributes {
  contact: UserSummaryDTO;
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

export interface BlockResult {
  contact: ContactAttributes;
  /** `true` quando a linha foi criada ou passou de não bloqueada para bloqueada. */
  changed: boolean;
}

/** Presença de um contato como quem lista a vê (bloqueio ⇒ offline sem `lastSeenAt`). */
export type ContactPresence = Pick<PresenceStateDTO, 'state' | 'lastSeenAt'>;

/**
 * Contato com a presença do usuário. `presence: null` só em `GET /contacts` quando a presença
 * (Redis) está indisponível — a listagem degrada em vez de falhar.
 */
export interface ContactWithPresence extends ContactWithUser {
  presence: ContactPresence | null;
}
