import type {
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
  block(userId: string, contactId: string): Promise<ContactAttributes>;
  unblock(userId: string, contactId: string): Promise<boolean>;
}
