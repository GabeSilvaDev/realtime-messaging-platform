import type {
  AddContactDTO,
  ContactListOptions,
  ContactResponseDTO,
  ContactStats,
  ContactWithUser,
  PaginatedContacts,
  PublicUserDTO,
  UpdateContactDTO,
} from '../types';

export interface IContactService {
  addContact(userId: string, data: AddContactDTO): Promise<ContactResponseDTO>;
  updateContact(
    userId: string,
    contactId: string,
    data: UpdateContactDTO
  ): Promise<ContactResponseDTO>;
  removeContact(userId: string, contactId: string): Promise<void>;
  getContact(userId: string, contactId: string): Promise<ContactResponseDTO>;
  listContacts(userId: string, options?: ContactListOptions): Promise<PaginatedContacts>;
  listFavorites(userId: string): Promise<ContactWithUser[]>;
  setFavorite(userId: string, contactId: string, isFavorite: boolean): Promise<ContactResponseDTO>;
  setNickname(
    userId: string,
    contactId: string,
    nickname: string | null
  ): Promise<ContactResponseDTO>;
  blockUser(userId: string, targetId: string): Promise<void>;
  unblockUser(userId: string, targetId: string): Promise<void>;
  listBlocked(userId: string): Promise<ContactWithUser[]>;
  isBlocked(userId: string, targetId: string): Promise<boolean>;
  isBlockedByEither(userId: string, targetId: string): Promise<boolean>;
  isContact(userId: string, contactId: string): Promise<boolean>;
  getStats(userId: string): Promise<ContactStats>;
  recordInteraction(userId: string, otherUserId: string): Promise<void>;
  searchUsers(
    userId: string,
    query: string,
    options?: { limit?: number; excludeBlocked?: boolean }
  ): Promise<PublicUserDTO[]>;
  /** Quem tem `userId` como contato não bloqueado (audiência da presença). */
  listWatchers(userId: string): Promise<string[]>;
  /** Ids dos contatos não bloqueados de `userId`. */
  listContactIds(userId: string): Promise<string[]>;
  /** Ids com bloqueio em qualquer sentido com `userId` (cacheado em `cache:blocks:<id>`). */
  listBlockedEitherIds(userId: string): Promise<string[]>;
  /** Contatos não bloqueados de `userId` entre `contactIds` (ex.: os que estão online). */
  getContactsByIds(userId: string, contactIds: string[]): Promise<ContactWithUser[]>;
}
