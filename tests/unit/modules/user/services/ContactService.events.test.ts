jest.mock('@/shared/database', () => ({
  sequelize: { models: {} },
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

jest.mock('@/modules/user/repositories', () => ({
  contactRepository: {},
  userRepository: {},
  ContactRepository: jest.fn(),
  UserRepository: jest.fn(),
}));

import { ContactService } from '@/modules/user/services/ContactService';
import type { IContactRepository, IUserRepository } from '@/modules/user/interfaces';
import { UserEvents } from '@/shared/types';

describe('ContactService — eventos de bloqueio', () => {
  const contacts = {
    block: jest.fn(),
    unblock: jest.fn(),
    isBlocked: jest.fn(),
    findByUserAndContact: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<IContactRepository>;
  const users = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<IUserRepository>;
  const events = { publish: jest.fn().mockResolvedValue('event-id') };

  let service: ContactService;

  beforeEach(() => {
    jest.clearAllMocks();
    events.publish.mockResolvedValue('event-id');
    service = new ContactService(contacts, users, events);
  });

  it('deve publicar user:blocked quando o bloqueio alterou a linha (changed=true)', async () => {
    (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1' });
    (contacts.block as jest.Mock).mockResolvedValue({ contact: {}, changed: true });

    await service.blockUser('user-1', 'target-1');

    expect(contacts.block).toHaveBeenCalledWith('user-1', 'target-1');
    expect(events.publish).toHaveBeenCalledWith(UserEvents.BLOCKED, {
      userId: 'user-1',
      blockedUserId: 'target-1',
    });
  });

  it('não deve publicar quando o repositório informa changed=false (já bloqueado/concorrência)', async () => {
    (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1' });
    (contacts.block as jest.Mock).mockResolvedValue({ contact: {}, changed: false });

    await service.blockUser('user-1', 'target-1');

    expect(events.publish).not.toHaveBeenCalled();
  });

  it('não deve publicar quando o alvo não existe', async () => {
    (users.findById as jest.Mock).mockResolvedValue(null);

    await expect(service.blockUser('user-1', 'target-1')).rejects.toThrow();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('não deve publicar ao tentar bloquear a si mesmo', async () => {
    await expect(service.blockUser('user-1', 'user-1')).rejects.toThrow();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('deve publicar user:unblocked após desbloquear', async () => {
    (contacts.unblock as jest.Mock).mockResolvedValue(true);

    await service.unblockUser('user-1', 'target-1');

    expect(events.publish).toHaveBeenCalledWith(UserEvents.UNBLOCKED, {
      userId: 'user-1',
      unblockedUserId: 'target-1',
    });
  });

  it('não deve publicar quando não havia bloqueio', async () => {
    (contacts.unblock as jest.Mock).mockResolvedValue(false);

    await expect(service.unblockUser('user-1', 'target-1')).rejects.toThrow();
    expect(events.publish).not.toHaveBeenCalled();
  });

  describe('contatos (quem vê a presença de contactId mudou)', () => {
    const contactRow = {
      id: 'row-1',
      userId: 'user-1',
      contactId: 'target-1',
      nickname: null,
      isBlocked: false,
      isFavorite: false,
      blockedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    it('addContact publica user:contact-added', async () => {
      (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1', username: 'alvo' });
      jest.spyOn(service, 'isBlockedByEither').mockResolvedValue(false);
      (contacts.findByUserAndContact as jest.Mock).mockResolvedValue(null);
      (contacts.create as jest.Mock).mockResolvedValue(contactRow);

      await service.addContact('user-1', { contactId: 'target-1' });

      expect(events.publish).toHaveBeenCalledWith(UserEvents.CONTACT_ADDED, {
        userId: 'user-1',
        contactId: 'target-1',
      });
    });

    it('addContact recusado (já é contato) não publica', async () => {
      (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1', username: 'alvo' });
      jest.spyOn(service, 'isBlockedByEither').mockResolvedValue(false);
      (contacts.findByUserAndContact as jest.Mock).mockResolvedValue(contactRow);

      await expect(service.addContact('user-1', { contactId: 'target-1' })).rejects.toThrow();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('removeContact publica user:contact-removed', async () => {
      (contacts.findByUserAndContact as jest.Mock).mockResolvedValue(contactRow);
      (contacts.delete as jest.Mock).mockResolvedValue(true);

      await service.removeContact('user-1', 'target-1');

      expect(events.publish).toHaveBeenCalledWith(UserEvents.CONTACT_REMOVED, {
        userId: 'user-1',
        contactId: 'target-1',
      });
    });

    it('removeContact de quem não é contato não publica', async () => {
      (contacts.findByUserAndContact as jest.Mock).mockResolvedValue(null);

      await expect(service.removeContact('user-1', 'target-1')).rejects.toThrow();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});
