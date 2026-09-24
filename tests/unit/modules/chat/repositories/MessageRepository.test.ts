jest.mock('@/modules/chat/models/Message', () => ({
  MessageModel: {
    create: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

import { Types } from 'mongoose';
import { MessageModel } from '@/modules/chat/models/Message';
import {
  MessageRepository,
  messageRepository,
} from '@/modules/chat/repositories/MessageRepository';
import type { CreateMessageData } from '@/modules/chat/types';

const MockMessageModel = MessageModel as unknown as {
  create: jest.Mock;
  findById: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  updateOne: jest.Mock;
  updateMany: jest.Mock;
  deleteMany: jest.Mock;
};

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SENDER_ID = '11111111-1111-4111-8111-111111111111';
const MENTIONED_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_ID = '65f000000000000000000001';
const REPLY_ID = '65f000000000000000000000';
const CREATED_AT = new Date('2026-09-24T10:00:00.000Z');
const STATUS_AT = new Date('2026-09-24T10:05:00.000Z');

function fakeDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(MESSAGE_ID),
    conversationId: CONVERSATION_ID,
    senderId: SENDER_ID,
    content: { type: 'text', text: 'olá' },
    replyTo: null,
    mentions: [MENTIONED_ID],
    metadata: { ip: '127.0.0.1', device: 'jest' },
    clientMessageId: null,
    deliveredTo: [],
    readBy: [],
    deletedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

const expectedRecord = {
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  senderId: SENDER_ID,
  content: { type: 'text', text: 'olá' },
  replyTo: null,
  mentions: [MENTIONED_ID],
  metadata: { ip: '127.0.0.1', device: 'jest' },
  clientMessageId: null,
  deliveredTo: [],
  readBy: [],
  deletedAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

function createData(overrides: Partial<CreateMessageData> = {}): CreateMessageData {
  return {
    conversationId: CONVERSATION_ID,
    senderId: SENDER_ID,
    content: { type: 'text', text: 'olá' },
    replyTo: null,
    mentions: [MENTIONED_ID],
    metadata: { ip: '127.0.0.1', device: 'jest' },
    clientMessageId: null,
    ...overrides,
  };
}

function execResult(value: unknown): { exec: jest.Mock } {
  return { exec: jest.fn().mockResolvedValue(value) };
}

describe('MessageRepository', () => {
  let repository: MessageRepository;
  let query: { sort: jest.Mock; limit: jest.Mock; exec: jest.Mock };

  beforeEach(() => {
    repository = new MessageRepository();
    query = { sort: jest.fn(), limit: jest.fn(), exec: jest.fn() };
    query.sort.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    MockMessageModel.find.mockReturnValue(query);
  });

  it('deve exportar a instância singleton', () => {
    expect(messageRepository).toBeInstanceOf(MessageRepository);
  });

  describe('create', () => {
    it('deve persistir sem replyTo e mapear o documento para MessageRecord (created=true)', async () => {
      MockMessageModel.create.mockResolvedValue(fakeDoc());

      const result = await repository.create(createData());

      expect(MockMessageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          replyTo: null,
          clientMessageId: null,
        })
      );
      expect(result).toEqual({ record: expectedRecord, created: true });
    });

    it('deve converter replyTo para ObjectId', async () => {
      MockMessageModel.create.mockResolvedValue(fakeDoc({ replyTo: new Types.ObjectId(REPLY_ID) }));

      const { record } = await repository.create(
        createData({ replyTo: REPLY_ID, mentions: [], metadata: { ip: null, device: null } })
      );

      const payload = MockMessageModel.create.mock.calls[0]![0] as { replyTo: Types.ObjectId };
      expect(payload.replyTo).toBeInstanceOf(Types.ObjectId);
      expect(payload.replyTo.toString()).toBe(REPLY_ID);
      expect(record.replyTo).toBe(REPLY_ID);
    });

    it('deve mapear clientMessageId e as entradas de status', async () => {
      MockMessageModel.create.mockResolvedValue(
        fakeDoc({
          clientMessageId: CLIENT_MESSAGE_ID,
          deliveredTo: [{ userId: MENTIONED_ID, at: STATUS_AT }],
          readBy: [{ userId: MENTIONED_ID, at: STATUS_AT }],
        })
      );

      const { record } = await repository.create(
        createData({ clientMessageId: CLIENT_MESSAGE_ID })
      );

      expect(record.clientMessageId).toBe(CLIENT_MESSAGE_ID);
      expect(record.deliveredTo).toEqual([{ userId: MENTIONED_ID, at: STATUS_AT }]);
      expect(record.readBy).toEqual([{ userId: MENTIONED_ID, at: STATUS_AT }]);
    });

    it('reenvio concorrente (E11000 no índice de clientMessageId) devolve a existente com created=false', async () => {
      MockMessageModel.create.mockRejectedValue(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
      );
      MockMessageModel.findOne.mockReturnValue(
        execResult(fakeDoc({ clientMessageId: CLIENT_MESSAGE_ID }))
      );

      const result = await repository.create(createData({ clientMessageId: CLIENT_MESSAGE_ID }));

      expect(MockMessageModel.findOne).toHaveBeenCalledWith({
        senderId: SENDER_ID,
        clientMessageId: CLIENT_MESSAGE_ID,
      });
      expect(result.created).toBe(false);
      expect(result.record.clientMessageId).toBe(CLIENT_MESSAGE_ID);
    });

    it('relança E11000 quando a existente não é encontrada', async () => {
      const error = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      MockMessageModel.create.mockRejectedValue(error);
      MockMessageModel.findOne.mockReturnValue(execResult(null));

      await expect(
        repository.create(createData({ clientMessageId: CLIENT_MESSAGE_ID }))
      ).rejects.toBe(error);
    });

    it('relança sem consultar quando não há clientMessageId ou o erro não é de chave duplicada', async () => {
      const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      const other = new Error('mongo down');
      MockMessageModel.create.mockRejectedValueOnce(duplicate).mockRejectedValueOnce(other);

      await expect(repository.create(createData())).rejects.toBe(duplicate);
      await expect(
        repository.create(createData({ clientMessageId: CLIENT_MESSAGE_ID }))
      ).rejects.toBe(other);
      expect(MockMessageModel.findOne).not.toHaveBeenCalled();
    });

    it('relança rejeições que não são objetos', async () => {
      MockMessageModel.create.mockRejectedValue('falhou');

      await expect(
        repository.create(createData({ clientMessageId: CLIENT_MESSAGE_ID }))
      ).rejects.toBe('falhou');
    });
  });

  describe('findById', () => {
    it('deve retornar o registro quando existe', async () => {
      MockMessageModel.findById.mockReturnValue(execResult(fakeDoc()));

      const result = await repository.findById(MESSAGE_ID);

      expect(MockMessageModel.findById).toHaveBeenCalledWith(MESSAGE_ID);
      expect(result).toEqual(expectedRecord);
    });

    it('deve retornar null quando não existe', async () => {
      MockMessageModel.findById.mockReturnValue(execResult(null));

      await expect(repository.findById(MESSAGE_ID)).resolves.toBeNull();
    });
  });

  describe('findByClientMessageId', () => {
    it('deve buscar pelo par remetente + clientMessageId', async () => {
      MockMessageModel.findOne.mockReturnValue(
        execResult(fakeDoc({ clientMessageId: CLIENT_MESSAGE_ID }))
      );

      const result = await repository.findByClientMessageId(SENDER_ID, CLIENT_MESSAGE_ID);

      expect(MockMessageModel.findOne).toHaveBeenCalledWith({
        senderId: SENDER_ID,
        clientMessageId: CLIENT_MESSAGE_ID,
      });
      expect(result?.id).toBe(MESSAGE_ID);
    });

    it('deve retornar null quando não existe', async () => {
      MockMessageModel.findOne.mockReturnValue(execResult(null));

      await expect(
        repository.findByClientMessageId(SENDER_ID, CLIENT_MESSAGE_ID)
      ).resolves.toBeNull();
    });
  });

  describe('findByConversation', () => {
    it('deve buscar a primeira página ordenada por createdAt/_id desc', async () => {
      query.exec.mockResolvedValue([fakeDoc()]);

      const result = await repository.findByConversation(CONVERSATION_ID, { limit: 50 });

      expect(MockMessageModel.find).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID });
      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(query.limit).toHaveBeenCalledWith(50);
      expect(result).toEqual([expectedRecord]);
    });

    it('deve aplicar o cursor (createdAt menor, ou igual com _id menor)', async () => {
      query.exec.mockResolvedValue([]);

      await repository.findByConversation(CONVERSATION_ID, {
        limit: 2,
        before: { createdAt: CREATED_AT, id: MESSAGE_ID },
      });

      const filter = MockMessageModel.find.mock.calls[0]![0] as {
        conversationId: string;
        $or: [{ createdAt: { $lt: Date } }, { createdAt: Date; _id: { $lt: Types.ObjectId } }];
      };
      expect(filter.conversationId).toBe(CONVERSATION_ID);
      expect(filter.$or[0]).toEqual({ createdAt: { $lt: CREATED_AT } });
      expect(filter.$or[1].createdAt).toBe(CREATED_AT);
      expect(filter.$or[1]._id.$lt.toString()).toBe(MESSAGE_ID);
      expect(query.limit).toHaveBeenCalledWith(2);
    });
  });

  describe('softDelete', () => {
    it('deve marcar deletedAt só se ainda não apagada e retornar true', async () => {
      const at = new Date('2026-09-24T11:00:00.000Z');
      MockMessageModel.updateOne.mockReturnValue(execResult({ modifiedCount: 1 }));

      const result = await repository.softDelete(MESSAGE_ID, at);

      expect(MockMessageModel.updateOne).toHaveBeenCalledWith(
        { _id: MESSAGE_ID, deletedAt: null },
        { $set: { deletedAt: at } }
      );
      expect(result).toBe(true);
    });

    it('deve retornar false quando já estava apagada', async () => {
      MockMessageModel.updateOne.mockReturnValue(execResult({ modifiedCount: 0 }));

      await expect(repository.softDelete(MESSAGE_ID, new Date())).resolves.toBe(false);
    });
  });

  describe('markDelivered', () => {
    it('deve fazer $push condicional (só se o usuário ainda não consta) e retornar true', async () => {
      MockMessageModel.updateOne.mockReturnValue(execResult({ modifiedCount: 1 }));

      const result = await repository.markDelivered(MESSAGE_ID, MENTIONED_ID, STATUS_AT);

      expect(MockMessageModel.updateOne).toHaveBeenCalledWith(
        { _id: MESSAGE_ID, 'deliveredTo.userId': { $ne: MENTIONED_ID } },
        { $push: { deliveredTo: { userId: MENTIONED_ID, at: STATUS_AT } } }
      );
      expect(result).toBe(true);
    });

    it('deve retornar false quando já estava entregue (idempotente)', async () => {
      MockMessageModel.updateOne.mockReturnValue(execResult({ modifiedCount: 0 }));

      await expect(repository.markDelivered(MESSAGE_ID, MENTIONED_ID, STATUS_AT)).resolves.toBe(
        false
      );
    });
  });

  describe('markReadUpTo', () => {
    it('marca entregue (se faltava) e lida as mensagens de outros autores até o limite', async () => {
      MockMessageModel.updateMany
        .mockReturnValueOnce(execResult({ modifiedCount: 1 }))
        .mockReturnValueOnce(execResult({ modifiedCount: 3 }));

      const count = await repository.markReadUpTo(
        CONVERSATION_ID,
        MENTIONED_ID,
        CREATED_AT,
        STATUS_AT
      );

      const fromOthers = {
        conversationId: CONVERSATION_ID,
        createdAt: { $lte: CREATED_AT },
        senderId: { $ne: MENTIONED_ID },
        deletedAt: null,
      };
      expect(MockMessageModel.updateMany).toHaveBeenNthCalledWith(
        1,
        { ...fromOthers, 'deliveredTo.userId': { $ne: MENTIONED_ID } },
        { $push: { deliveredTo: { userId: MENTIONED_ID, at: STATUS_AT } } }
      );
      expect(MockMessageModel.updateMany).toHaveBeenNthCalledWith(
        2,
        { ...fromOthers, 'readBy.userId': { $ne: MENTIONED_ID } },
        { $push: { readBy: { userId: MENTIONED_ID, at: STATUS_AT } } }
      );
      expect(count).toBe(3);
    });

    it('retorna 0 quando nada mudou', async () => {
      MockMessageModel.updateMany.mockReturnValue(execResult({ modifiedCount: 0 }));

      await expect(
        repository.markReadUpTo(CONVERSATION_ID, MENTIONED_ID, CREATED_AT, STATUS_AT)
      ).resolves.toBe(0);
    });
  });

  describe('deleteByConversation', () => {
    it('deve apagar todas as mensagens da conversa e retornar a quantidade removida', async () => {
      MockMessageModel.deleteMany.mockReturnValue(execResult({ deletedCount: 3 }));

      const result = await repository.deleteByConversation(CONVERSATION_ID);

      expect(MockMessageModel.deleteMany).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID });
      expect(result).toBe(3);
    });

    it('deve retornar 0 quando não havia mensagens', async () => {
      MockMessageModel.deleteMany.mockReturnValue(execResult({ deletedCount: 0 }));

      await expect(repository.deleteByConversation(CONVERSATION_ID)).resolves.toBe(0);
    });
  });
});
