jest.mock('@/shared/database/sequelize', () => ({
  __esModule: true,
  default: { transaction: jest.fn() },
}));

jest.mock('@/modules/chat/models/Conversation', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('@/modules/chat/models/Participant', () => ({
  __esModule: true,
  default: {
    bulkCreate: jest.fn(),
    findAndCountAll: jest.fn(),
  },
}));

import { Op, UniqueConstraintError } from 'sequelize';
import sequelize from '@/shared/database/sequelize';
import Conversation from '@/modules/chat/models/Conversation';
import Participant from '@/modules/chat/models/Participant';
import {
  ConversationRepository,
  conversationRepository,
} from '@/modules/chat/repositories/ConversationRepository';

const MockConversation = Conversation as jest.Mocked<typeof Conversation>;
const MockParticipant = Participant as jest.Mocked<typeof Participant>;
const mockTransaction = sequelize.transaction as unknown as jest.Mock;

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const DIRECT_KEY = `${USER_A}:${USER_B}`;
const TX = { id: 'tx' };

function conversationRow(overrides: Record<string, unknown> = {}): {
  id: string;
  toJSON: jest.Mock;
} {
  const attrs = {
    id: CONVERSATION_ID,
    type: 'direct',
    name: null,
    avatarUrl: null,
    createdBy: USER_A,
    directKey: DIRECT_KEY,
    lastMessageAt: null,
    createdAt: new Date('2026-09-24T00:00:00.000Z'),
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    ...overrides,
  };
  return { id: attrs.id as string, toJSON: jest.fn().mockReturnValue(attrs) };
}

describe('ConversationRepository', () => {
  let repository: ConversationRepository;

  beforeEach(() => {
    repository = new ConversationRepository();
    mockTransaction.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) =>
      callback(TX)
    );
  });

  it('deve exportar a instância singleton', () => {
    expect(conversationRepository).toBeInstanceOf(ConversationRepository);
  });

  describe('findById', () => {
    it('deve retornar a conversa serializada', async () => {
      const row = conversationRow();
      MockConversation.findByPk.mockResolvedValue(row as never);

      const result = await repository.findById(CONVERSATION_ID);

      expect(MockConversation.findByPk).toHaveBeenCalledWith(CONVERSATION_ID, {
        transaction: undefined,
      });
      expect(result?.id).toBe(CONVERSATION_ID);
    });

    it('deve retornar null quando não existe', async () => {
      MockConversation.findByPk.mockResolvedValue(null);

      await expect(repository.findById(CONVERSATION_ID)).resolves.toBeNull();
    });

    it('deve repassar a transação quando informada', async () => {
      MockConversation.findByPk.mockResolvedValue(conversationRow() as never);

      await repository.findById(CONVERSATION_ID, TX as never);

      expect(MockConversation.findByPk).toHaveBeenCalledWith(CONVERSATION_ID, { transaction: TX });
    });
  });

  describe('findByDirectKey', () => {
    it('deve buscar pela direct_key', async () => {
      MockConversation.findOne.mockResolvedValue(conversationRow() as never);

      const result = await repository.findByDirectKey(DIRECT_KEY);

      expect(MockConversation.findOne).toHaveBeenCalledWith({ where: { directKey: DIRECT_KEY } });
      expect(result?.directKey).toBe(DIRECT_KEY);
    });

    it('deve retornar null quando não existe', async () => {
      MockConversation.findOne.mockResolvedValue(null);

      await expect(repository.findByDirectKey(DIRECT_KEY)).resolves.toBeNull();
    });
  });

  describe('createDirect', () => {
    it('deve criar conversa e os dois participantes na mesma transação', async () => {
      MockConversation.create.mockResolvedValue(conversationRow() as never);
      MockParticipant.bulkCreate.mockResolvedValue([] as never);

      const result = await repository.createDirect({
        directKey: DIRECT_KEY,
        createdBy: USER_A,
        userIds: [USER_A, USER_B],
      });

      expect(MockConversation.create).toHaveBeenCalledWith(
        { type: 'direct', directKey: DIRECT_KEY, createdBy: USER_A },
        { transaction: TX }
      );
      expect(MockParticipant.bulkCreate).toHaveBeenCalledWith(
        [
          { conversationId: CONVERSATION_ID, userId: USER_A, role: 'member' },
          { conversationId: CONVERSATION_ID, userId: USER_B, role: 'member' },
        ],
        { transaction: TX }
      );
      expect(result).toEqual({
        conversation: expect.objectContaining({ id: CONVERSATION_ID }),
        created: true,
      });
    });

    it('deve devolver a conversa existente quando a direct_key já foi criada por outra requisição', async () => {
      mockTransaction.mockRejectedValue(new UniqueConstraintError({}));
      MockConversation.findOne.mockResolvedValue(conversationRow() as never);

      const result = await repository.createDirect({
        directKey: DIRECT_KEY,
        createdBy: USER_A,
        userIds: [USER_A, USER_B],
      });

      expect(result.created).toBe(false);
      expect(result.conversation.id).toBe(CONVERSATION_ID);
    });

    it('deve relançar a violação de unicidade quando a existente não é encontrada', async () => {
      const error = new UniqueConstraintError({});
      mockTransaction.mockRejectedValue(error);
      MockConversation.findOne.mockResolvedValue(null);

      await expect(
        repository.createDirect({
          directKey: DIRECT_KEY,
          createdBy: USER_A,
          userIds: [USER_A, USER_B],
        })
      ).rejects.toBe(error);
    });

    it('deve relançar erros que não são de unicidade', async () => {
      const error = new Error('db down');
      mockTransaction.mockRejectedValue(error);

      await expect(
        repository.createDirect({
          directKey: DIRECT_KEY,
          createdBy: USER_A,
          userIds: [USER_A, USER_B],
        })
      ).rejects.toBe(error);
      expect(MockConversation.findOne).not.toHaveBeenCalled();
    });
  });

  describe('createGroup', () => {
    it('deve criar o grupo com o criador admin e os demais member', async () => {
      MockConversation.create.mockResolvedValue(
        conversationRow({ type: 'group', name: 'Time', directKey: null }) as never
      );
      MockParticipant.bulkCreate.mockResolvedValue([] as never);

      const result = await repository.createGroup({
        name: 'Time',
        createdBy: USER_A,
        memberIds: [USER_B, USER_C],
      });

      expect(MockConversation.create).toHaveBeenCalledWith(
        { type: 'group', name: 'Time', createdBy: USER_A },
        { transaction: TX }
      );
      expect(MockParticipant.bulkCreate).toHaveBeenCalledWith(
        [
          { conversationId: CONVERSATION_ID, userId: USER_A, role: 'admin' },
          { conversationId: CONVERSATION_ID, userId: USER_B, role: 'member' },
          { conversationId: CONVERSATION_ID, userId: USER_C, role: 'member' },
        ],
        { transaction: TX }
      );
      expect(result.type).toBe('group');
    });
  });

  describe('listForUser', () => {
    it('deve listar conversas ativas ordenadas por last_message_at DESC NULLS LAST', async () => {
      const membership = { userId: USER_A, role: 'member' };
      MockParticipant.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ conversation: conversationRow(), toJSON: jest.fn().mockReturnValue(membership) }],
      } as never);

      const result = await repository.listForUser(USER_A, {
        archived: false,
        limit: 20,
        offset: 0,
      });

      expect(MockParticipant.findAndCountAll).toHaveBeenCalledWith({
        where: { userId: USER_A, archivedAt: null },
        include: [{ model: Conversation, as: 'conversation', required: true }],
        order: [
          [{ model: Conversation, as: 'conversation' }, 'lastMessageAt', 'DESC NULLS LAST'],
          [{ model: Conversation, as: 'conversation' }, 'createdAt', 'DESC'],
          [{ model: Conversation, as: 'conversation' }, 'id', 'DESC'],
        ],
        limit: 20,
        offset: 0,
      });
      expect(result.total).toBe(1);
      expect(result.rows).toEqual([
        { conversation: expect.objectContaining({ id: CONVERSATION_ID }), membership },
      ]);
    });

    it('deve desempatar por id DESC da conversa como último critério', async () => {
      MockParticipant.findAndCountAll.mockResolvedValue({ count: 0, rows: [] } as never);

      await repository.listForUser(USER_A, { archived: false, limit: 20, offset: 0 });

      const call = MockParticipant.findAndCountAll.mock.calls[0]![0] as { order: unknown[] };
      expect(call.order).toHaveLength(3);
      expect(call.order[2]).toEqual([{ model: Conversation, as: 'conversation' }, 'id', 'DESC']);
    });

    it('deve filtrar arquivadas com archived_at IS NOT NULL', async () => {
      MockParticipant.findAndCountAll.mockResolvedValue({ count: 0, rows: [] } as never);

      await repository.listForUser(USER_A, { archived: true, limit: 10, offset: 5 });

      expect(MockParticipant.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_A, archivedAt: { [Op.ne]: null } },
          limit: 10,
          offset: 5,
        })
      );
    });

    it('deve ignorar linhas sem conversa carregada', async () => {
      MockParticipant.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ conversation: undefined, toJSON: jest.fn() }],
      } as never);

      const result = await repository.listForUser(USER_A, {
        archived: false,
        limit: 20,
        offset: 0,
      });

      expect(result.rows).toEqual([]);
    });
  });

  describe('rename', () => {
    it('deve atualizar o nome', async () => {
      MockConversation.update.mockResolvedValue([1] as never);

      await repository.rename(CONVERSATION_ID, 'Novo');

      expect(MockConversation.update).toHaveBeenCalledWith(
        { name: 'Novo' },
        { where: { id: CONVERSATION_ID } }
      );
    });
  });

  describe('touchLastMessageAt', () => {
    it('deve avançar last_message_at apenas se for mais recente', async () => {
      const at = new Date('2026-09-24T10:00:00.000Z');
      MockConversation.update.mockResolvedValue([1] as never);

      await repository.touchLastMessageAt(CONVERSATION_ID, at);

      expect(MockConversation.update).toHaveBeenCalledWith(
        { lastMessageAt: at },
        {
          where: {
            id: CONVERSATION_ID,
            [Op.or]: [{ lastMessageAt: null }, { lastMessageAt: { [Op.lt]: at } }],
          },
        }
      );
    });
  });

  describe('delete', () => {
    it('deve remover a conversa', async () => {
      MockConversation.destroy.mockResolvedValue(1);

      await repository.delete(CONVERSATION_ID);

      expect(MockConversation.destroy).toHaveBeenCalledWith({ where: { id: CONVERSATION_ID } });
    });

    it('deve repassar a transação quando informada', async () => {
      MockConversation.destroy.mockResolvedValue(1);

      await repository.delete(CONVERSATION_ID, TX as never);

      expect(MockConversation.destroy).toHaveBeenCalledWith({
        where: { id: CONVERSATION_ID },
        transaction: TX,
      });
    });
  });

  describe('withLock', () => {
    const LOCK_TX = { LOCK: { UPDATE: 'UPDATE' } };

    beforeEach(() => {
      mockTransaction.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) =>
        callback(LOCK_TX)
      );
    });

    it('abre transação, trava a linha da conversa (SELECT ... FOR UPDATE) e executa o trabalho', async () => {
      MockConversation.findByPk.mockResolvedValue(conversationRow() as never);
      const work = jest.fn().mockResolvedValue('resultado');

      const result = await repository.withLock(CONVERSATION_ID, work);

      expect(MockConversation.findByPk).toHaveBeenCalledWith(CONVERSATION_ID, {
        transaction: LOCK_TX,
        lock: 'UPDATE',
      });
      expect(work).toHaveBeenCalledWith(LOCK_TX);
      expect(result).toBe('resultado');
    });

    it('executa o trabalho mesmo sem a linha (o service decide o 404) e propaga erros', async () => {
      MockConversation.findByPk.mockResolvedValue(null);
      const error = new Error('regra violada');

      await expect(
        repository.withLock(CONVERSATION_ID, jest.fn().mockRejectedValue(error))
      ).rejects.toBe(error);
    });
  });
});
