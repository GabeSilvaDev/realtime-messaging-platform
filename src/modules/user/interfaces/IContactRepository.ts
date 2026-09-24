import type {
  BlockResult,
  ContactAttributes,
  ContactCreationAttributes,
  ContactListOptions,
  ContactStats,
  ContactWithUser,
  PaginatedContacts,
} from '../types';

export interface IContactRepository {
  findById(id: string): Promise<ContactAttributes | null>;
  findByUserAndContact(userId: string, contactId: string): Promise<ContactAttributes | null>;
  findAllByUser(userId: string, options?: ContactListOptions): Promise<PaginatedContacts>;
  findBlockedByUser(userId: string): Promise<ContactWithUser[]>;
  findFavoritesByUser(userId: string): Promise<ContactWithUser[]>;
  create(data: ContactCreationAttributes): Promise<ContactAttributes>;
  update(id: string, data: Partial<ContactAttributes>): Promise<ContactAttributes | null>;
  delete(id: string): Promise<boolean>;
  deleteByUserAndContact(userId: string, contactId: string): Promise<boolean>;
  isBlocked(userId: string, targetId: string): Promise<boolean>;
  isContact(userId: string, contactId: string): Promise<boolean>;
  getStats(userId: string): Promise<ContactStats>;
  block(userId: string, contactId: string): Promise<BlockResult>;
  unblock(userId: string, contactId: string): Promise<boolean>;
  /** Grava `last_interaction_at` nas linhas de contato dos dois sentidos, se existirem. */
  touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void>;
  /** Ids de quem tem `userId` como contato (linha não bloqueada). */
  listWatcherIds(userId: string): Promise<string[]>;
  /** Ids dos contatos (não bloqueados) de `userId`. */
  listContactIds(userId: string): Promise<string[]>;
  /** Ids com bloqueio em qualquer sentido com `userId` (sem repetição). */
  listBlockedEitherIds(userId: string): Promise<string[]>;
  /** Contatos não bloqueados de `userId` entre `contactIds`, com o usuário de cada um. */
  findByUserAndContactIds(userId: string, contactIds: string[]): Promise<ContactWithUser[]>;
}
