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
});
