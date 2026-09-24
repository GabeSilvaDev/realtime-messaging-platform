import type { UserAttributes } from '@/shared/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { UserEvents } from '@/shared/types';
import { contactRepository, userRepository } from '../repositories';
import type { IContactRepository, IContactService, IUserRepository } from '../interfaces';
import {
  ContactNotFoundException,
  ContactAlreadyExistsException,
  CannotAddSelfException,
  UserBlockedException,
  CannotBlockSelfException,
  UserNotFoundException,
} from '../errors';
import type {
  AddContactDTO,
  ContactAttributes,
  ContactListOptions,
  ContactResponseDTO,
  ContactStats,
  ContactWithUser,
  PaginatedContacts,
  PublicUserDTO,
  UpdateContactDTO,
  UserWithContactInfo,
} from '../types';

export {
  ContactNotFoundException,
  ContactAlreadyExistsException,
  CannotAddSelfException,
  UserBlockedException,
  CannotBlockSelfException,
  UserNotFoundException,
} from '../errors';

export class ContactService implements IContactService {
  constructor(
    private readonly contacts: IContactRepository = contactRepository,
    private readonly users: IUserRepository = userRepository,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

  async addContact(userId: string, data: AddContactDTO): Promise<ContactResponseDTO> {
    if (userId === data.contactId) {
      throw new CannotAddSelfException();
    }

    const contactUser = await this.users.findById(data.contactId);
    if (!contactUser) {
      throw new UserNotFoundException();
    }

    const isBlocked = await this.isBlockedByEither(userId, data.contactId);
    if (isBlocked) {
      throw new UserBlockedException();
    }

    const existingContact = await this.contacts.findByUserAndContact(userId, data.contactId);
    if (existingContact) {
      throw new ContactAlreadyExistsException();
    }

    const contact = await this.contacts.create({
      userId,
      contactId: data.contactId,
      nickname: data.nickname ?? null,
    });
    await this.events.publish(UserEvents.CONTACT_ADDED, { userId, contactId: data.contactId });

    return {
      ...contact,
      contact: this.toPublicUser(contactUser),
    };
  }

  async updateContact(
    userId: string,
    contactId: string,
    data: UpdateContactDTO
  ): Promise<ContactResponseDTO> {
    const contact = await this.findVisibleContact(userId, contactId);

    const contactUser = await this.users.findById(contactId);
    if (!contactUser) {
      throw new UserNotFoundException();
    }

    const updated = await this.contacts.update(contact.id, {
      nickname: data.nickname,
      isFavorite: data.isFavorite,
    });

    if (!updated) {
      throw new ContactNotFoundException();
    }

    return {
      ...updated,
      contact: this.toPublicUser(contactUser),
    };
  }

  async removeContact(userId: string, contactId: string): Promise<void> {
    const contact = await this.findVisibleContact(userId, contactId);

    await this.contacts.delete(contact.id);
    await this.events.publish(UserEvents.CONTACT_REMOVED, { userId, contactId });
  }

  async getContact(userId: string, contactId: string): Promise<ContactResponseDTO> {
    const contact = await this.findVisibleContact(userId, contactId);

    const contactUser = await this.users.findById(contactId);
    if (!contactUser) {
      throw new UserNotFoundException();
    }

    return {
      ...contact,
      contact: this.toPublicUser(contactUser),
    };
  }

  async listContacts(userId: string, options: ContactListOptions = {}): Promise<PaginatedContacts> {
    return this.contacts.findAllByUser(userId, options);
  }

  async listFavorites(userId: string): Promise<ContactWithUser[]> {
    return this.contacts.findFavoritesByUser(userId);
  }

  async setFavorite(
    userId: string,
    contactId: string,
    isFavorite: boolean
  ): Promise<ContactResponseDTO> {
    return this.updateContact(userId, contactId, { isFavorite });
  }

  async setNickname(
    userId: string,
    contactId: string,
    nickname: string | null
  ): Promise<ContactResponseDTO> {
    return this.updateContact(userId, contactId, { nickname });
  }

  async blockUser(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) {
      throw new CannotBlockSelfException();
    }

    const targetUser = await this.users.findById(targetId);
    if (!targetUser) {
      throw new UserNotFoundException();
    }

    const { changed } = await this.contacts.block(userId, targetId);
    if (changed) {
      await this.events.publish(UserEvents.BLOCKED, { userId, blockedUserId: targetId });
    }
  }

  async unblockUser(userId: string, targetId: string): Promise<void> {
    const unblocked = await this.contacts.unblock(userId, targetId);
    if (!unblocked) {
      throw new ContactNotFoundException('Usuário não está bloqueado');
    }

    await this.events.publish(UserEvents.UNBLOCKED, { userId, unblockedUserId: targetId });
  }

  async listBlocked(userId: string): Promise<ContactWithUser[]> {
    return this.contacts.findBlockedByUser(userId);
  }

  async isBlocked(userId: string, targetId: string): Promise<boolean> {
    return this.contacts.isBlocked(userId, targetId);
  }

  async isBlockedByEither(userId: string, targetId: string): Promise<boolean> {
    const [blockedByUser, blockedByTarget] = await Promise.all([
      this.contacts.isBlocked(userId, targetId),
      this.contacts.isBlocked(targetId, userId),
    ]);
    return blockedByUser || blockedByTarget;
  }

  async isContact(userId: string, contactId: string): Promise<boolean> {
    return this.contacts.isContact(userId, contactId);
  }

  async getStats(userId: string): Promise<ContactStats> {
    return this.contacts.getStats(userId);
  }

  async recordInteraction(userId: string, otherUserId: string): Promise<void> {
    await this.contacts.touchInteraction(userId, otherUserId, new Date());
  }

  async searchUsers(
    userId: string,
    query: string,
    options: { limit?: number; excludeBlocked?: boolean } = {}
  ): Promise<PublicUserDTO[]> {
    const { limit = 20, excludeBlocked = true } = options;

    const result = await this.users.search({
      filters: {
        query,
        excludeUserId: userId,
        excludeBlocked,
      },
      limit,
    });

    return result.users.map((u: UserWithContactInfo): PublicUserDTO => this.toPublicUser(u));
  }

  /**
   * Para o usuário, uma linha bloqueada não é um contato: get/update/remove respondem 404.
   * O desbloqueio acontece apenas por `DELETE /api/blocks/:userId`.
   */
  private async findVisibleContact(userId: string, contactId: string): Promise<ContactAttributes> {
    const contact = await this.contacts.findByUserAndContact(userId, contactId);
    if (!contact || contact.isBlocked) {
      throw new ContactNotFoundException();
    }
    return contact;
  }

  private toPublicUser(user: UserAttributes | UserWithContactInfo): PublicUserDTO {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
      lastSeenAt: user.lastSeenAt ?? null,
    };
  }
}

export const contactService = new ContactService();
