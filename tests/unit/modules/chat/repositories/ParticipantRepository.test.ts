jest.mock('@/modules/chat/models/Participant', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
    update: jest.fn(),
  },
}));

import { Op } from 'sequelize';
import Participant from '@/modules/chat/models/Participant';
import {
  ParticipantRepository,
  participantRepository,
} from '@/modules/chat/repositories/ParticipantRepository';

const MockParticipant = Participant as jest.Mocked<typeof Participant>;

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const TX = { id: 'tx' };
const OLDEST_FIRST = [
  ['joinedAt', 'ASC'],
  ['id', 'ASC'],
];

function row(attrs: Record<string, unknown>): { toJSON: jest.Mock } & Record<string, unknown> {
  return { ...attrs, toJSON: jest.fn().mockReturnValue(attrs) };
}

describe('ParticipantRepository', () => {
  let repository: ParticipantRepository;

  beforeEach(() => {
    repository = new ParticipantRepository();
  });

  it('deve exportar a instância singleton', () => {
    expect(participantRepository).toBeInstanceOf(ParticipantRepository);
  });

  describe('find', () => {
    it('deve retornar o participante serializado', async () => {
      MockParticipant.findOne.mockResolvedValue(row({ userId: USER_A }) as never);

      const result = await repository.find(CONVERSATION_ID, USER_A);

      expect(MockParticipant.findOne).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: USER_A },
      });
      expect(result).toEqual({ userId: USER_A });
    });

    it('deve retornar null quando não participa', async () => {
      MockParticipant.findOne.mockResolvedValue(null);

      await expect(repository.find(CONVERSATION_ID, USER_A)).resolves.toBeNull();
    });
  });

  describe('listByConversation', () => {
    it('deve listar do mais antigo para o mais novo', async () => {
      MockParticipant.findAll.mockResolvedValue([
        row({ userId: USER_A }),
        row({ userId: USER_B }),
      ] as never);

      const result = await repository.listByConversation(CONVERSATION_ID);

      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID },
        order: OLDEST_FIRST,
      });
      expect(result).toEqual([{ userId: USER_A }, { userId: USER_B }]);
    });
  });

  describe('listByConversations', () => {
    it('não deve consultar quando a lista é vazia', async () => {
      await expect(repository.listByConversations([])).resolves.toEqual([]);
      expect(MockParticipant.findAll).not.toHaveBeenCalled();
    });

    it('deve listar participantes de várias conversas', async () => {
      MockParticipant.findAll.mockResolvedValue([row({ userId: USER_A })] as never);

      const result = await repository.listByConversations([CONVERSATION_ID, OTHER_CONVERSATION_ID]);

      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: { conversationId: { [Op.in]: [CONVERSATION_ID, OTHER_CONVERSATION_ID] } },
        order: OLDEST_FIRST,
      });
      expect(result).toEqual([{ userId: USER_A }]);
    });
  });

  describe('listConversationIdsByUser', () => {
    it('deve retornar apenas os ids das conversas', async () => {
      MockParticipant.findAll.mockResolvedValue([
        { conversationId: CONVERSATION_ID },
        { conversationId: OTHER_CONVERSATION_ID },
      ] as never);

      const result = await repository.listConversationIdsByUser(USER_A);

      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: { userId: USER_A },
        attributes: ['conversationId'],
      });
      expect(result).toEqual([CONVERSATION_ID, OTHER_CONVERSATION_ID]);
    });
  });

  describe('addMembers', () => {
    it('não deve inserir quando a lista é vazia', async () => {
      await repository.addMembers(CONVERSATION_ID, []);

      expect(MockParticipant.bulkCreate).not.toHaveBeenCalled();
    });

    it('deve inserir como member ignorando duplicados', async () => {
      MockParticipant.bulkCreate.mockResolvedValue([] as never);

      await repository.addMembers(CONVERSATION_ID, [USER_A, USER_B]);

      expect(MockParticipant.bulkCreate).toHaveBeenCalledWith(
        [
          { conversationId: CONVERSATION_ID, userId: USER_A, role: 'member' },
          { conversationId: CONVERSATION_ID, userId: USER_B, role: 'member' },
        ],
        { ignoreDuplicates: true }
      );
    });
  });

  describe('remove / setRole / setArchivedAt', () => {
    it('remove deve apagar a linha do participante', async () => {
      MockParticipant.destroy.mockResolvedValue(1);

      await repository.remove(CONVERSATION_ID, USER_A);

      expect(MockParticipant.destroy).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: USER_A },
      });
    });

    it('setRole deve atualizar o papel', async () => {
      MockParticipant.update.mockResolvedValue([1] as never);

      await repository.setRole(CONVERSATION_ID, USER_A, 'admin');

      expect(MockParticipant.update).toHaveBeenCalledWith(
        { role: 'admin' },
        { where: { conversationId: CONVERSATION_ID, userId: USER_A } }
      );
    });

    it('setArchivedAt deve gravar a data (ou null para desarquivar)', async () => {
      const at = new Date('2026-09-24T00:00:00.000Z');
      MockParticipant.update.mockResolvedValue([1] as never);

      await repository.setArchivedAt(CONVERSATION_ID, USER_A, at);
      await repository.setArchivedAt(CONVERSATION_ID, USER_A, null);

      expect(MockParticipant.update).toHaveBeenNthCalledWith(
        1,
        { archivedAt: at },
        { where: { conversationId: CONVERSATION_ID, userId: USER_A } }
      );
      expect(MockParticipant.update).toHaveBeenNthCalledWith(
        2,
        { archivedAt: null },
        { where: { conversationId: CONVERSATION_ID, userId: USER_A } }
      );
    });
  });

  describe('advanceLastReadAt', () => {
    it('avança last_read_at só quando nulo ou anterior (nunca retrocede)', async () => {
      const at = new Date('2026-09-25T10:00:00.000Z');
      MockParticipant.update.mockResolvedValue([1] as never);

      await repository.advanceLastReadAt(CONVERSATION_ID, USER_A, at);

      expect(MockParticipant.update).toHaveBeenCalledWith(
        { lastReadAt: at },
        {
          where: {
            conversationId: CONVERSATION_ID,
            userId: USER_A,
            [Op.or]: [{ lastReadAt: null }, { lastReadAt: { [Op.lt]: at } }],
          },
        }
      );
    });
  });

  describe('dentro de transação (lock da conversa)', () => {
    it('find e listByConversation repassam a transação', async () => {
      MockParticipant.findOne.mockResolvedValue(null);
      MockParticipant.findAll.mockResolvedValue([] as never);

      await repository.find(CONVERSATION_ID, USER_A, TX as never);
      await repository.listByConversation(CONVERSATION_ID, TX as never);

      expect(MockParticipant.findOne).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: USER_A },
        transaction: TX,
      });
      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID },
        order: OLDEST_FIRST,
        transaction: TX,
      });
    });

    it('addMembers, remove e setRole repassam a transação', async () => {
      MockParticipant.bulkCreate.mockResolvedValue([] as never);
      MockParticipant.destroy.mockResolvedValue(1);
      MockParticipant.update.mockResolvedValue([1] as never);

      await repository.addMembers(CONVERSATION_ID, [USER_B], TX as never);
      await repository.remove(CONVERSATION_ID, USER_A, TX as never);
      await repository.setRole(CONVERSATION_ID, USER_B, 'admin', TX as never);

      expect(MockParticipant.bulkCreate).toHaveBeenCalledWith(
        [{ conversationId: CONVERSATION_ID, userId: USER_B, role: 'member' }],
        { ignoreDuplicates: true, transaction: TX }
      );
      expect(MockParticipant.destroy).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: USER_A },
        transaction: TX,
      });
      expect(MockParticipant.update).toHaveBeenCalledWith(
        { role: 'admin' },
        { where: { conversationId: CONVERSATION_ID, userId: USER_B }, transaction: TX }
      );
    });
  });
});
