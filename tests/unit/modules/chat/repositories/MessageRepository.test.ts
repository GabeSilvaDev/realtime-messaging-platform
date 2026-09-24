jest.mock('@/modules/chat/models/Message', () => ({
  MessageModel: {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
  },
}));

import { Types } from 'mongoose';
import { MessageModel } from '@/modules/chat/models/Message';
import {
  MessageRepository,
  messageRepository,
} from '@/modules/chat/repositories/MessageRepository';

const MockMessageModel = MessageModel as unknown as {
  create: jest.Mock;
  findById: jest.Mock;
  find: jest.Mock;
  updateOne: jest.Mock;
};

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SENDER_ID = '11111111-1111-4111-8111-111111111111';
const MENTIONED_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '65f000000000000000000001';
const REPLY_ID = '65f000000000000000000000';
const CREATED_AT = new Date('2026-09-24T10:00:00.000Z');

function fakeDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(MESSAGE_ID),
    conversationId: CONVERSATION_ID,
    senderId: SENDER_ID,
    content: { type: 'text', text: 'olá' },
    replyTo: null,
    mentions: [MENTIONED_ID],
    metadata: { ip: '127.0.0.1', device: 'jest' },
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
  deletedAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

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
    it('deve persistir sem replyTo e mapear o documento para MessageRecord', async () => {
      MockMessageModel.create.mockResolvedValue(fakeDoc());

      const result = await repository.create({
        conversationId: CONVERSATION_ID,
        senderId: SENDER_ID,
        content: { type: 'text', text: 'olá' },
        replyTo: null,
        mentions: [MENTIONED_ID],
        metadata: { ip: '127.0.0.1', device: 'jest' },
      });

      expect(MockMessageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: CONVERSATION_ID, replyTo: null })
      );
      expect(result).toEqual(expectedRecord);
    });

    it('deve converter replyTo para ObjectId', async () => {
      MockMessageModel.create.mockResolvedValue(fakeDoc({ replyTo: new Types.ObjectId(REPLY_ID) }));

      const result = await repository.create({
        conversationId: CONVERSATION_ID,
        senderId: SENDER_ID,
        content: { type: 'text', text: 'olá' },
        replyTo: REPLY_ID,
        mentions: [],
        metadata: { ip: null, device: null },
      });

      const payload = MockMessageModel.create.mock.calls[0]![0] as { replyTo: Types.ObjectId };
      expect(payload.replyTo).toBeInstanceOf(Types.ObjectId);
      expect(payload.replyTo.toString()).toBe(REPLY_ID);
      expect(result.replyTo).toBe(REPLY_ID);
    });
  });

  describe('findById', () => {
    it('deve retornar o registro quando existe', async () => {
      MockMessageModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(fakeDoc()) });

      const result = await repository.findById(MESSAGE_ID);

      expect(MockMessageModel.findById).toHaveBeenCalledWith(MESSAGE_ID);
      expect(result).toEqual(expectedRecord);
    });

    it('deve retornar null quando não existe', async () => {
      MockMessageModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(repository.findById(MESSAGE_ID)).resolves.toBeNull();
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
      MockMessageModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      });

      const result = await repository.softDelete(MESSAGE_ID, at);

      expect(MockMessageModel.updateOne).toHaveBeenCalledWith(
        { _id: MESSAGE_ID, deletedAt: null },
        { $set: { deletedAt: at } }
      );
      expect(result).toBe(true);
    });

    it('deve retornar false quando já estava apagada', async () => {
      MockMessageModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      });

      await expect(repository.softDelete(MESSAGE_ID, new Date())).resolves.toBe(false);
    });
  });
});
