import { Types } from 'mongoose';
import { MessageModel } from '@/modules/chat/models';

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SENDER_ID = '11111111-1111-4111-8111-111111111111';

describe('Message model (Mongoose)', () => {
  it('deve usar a coleção messages com timestamps', () => {
    expect(MessageModel.schema.get('collection')).toBe('messages');
    expect(MessageModel.schema.get('timestamps')).toBe(true);
  });

  it('deve declarar o índice composto da paginação por cursor', () => {
    expect(MessageModel.schema.indexes()).toContainEqual([
      { conversationId: 1, createdAt: -1, _id: -1 },
      expect.any(Object),
    ]);
  });

  it('deve aplicar defaults (replyTo, mentions, metadata, deletedAt)', () => {
    const message = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'olá' },
    });

    expect(message.validateSync()).toBeUndefined();
    expect(message.replyTo).toBeNull();
    expect(message.mentions).toEqual([]);
    expect(message.metadata.ip).toBeNull();
    expect(message.metadata.device).toBeNull();
    expect(message.deletedAt).toBeNull();
    expect(message._id).toBeInstanceOf(Types.ObjectId);
  });

  it('deve aceitar replyTo como ObjectId e mentions', () => {
    const replyTo = new Types.ObjectId();
    const message = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'resposta' },
      replyTo,
      mentions: ['22222222-2222-4222-8222-222222222222'],
      metadata: { ip: '127.0.0.1', device: 'jest' },
    });

    expect(message.validateSync()).toBeUndefined();
    expect(message.replyTo?.toString()).toBe(replyTo.toString());
    expect(message.mentions).toEqual(['22222222-2222-4222-8222-222222222222']);
  });

  it('deve exigir conversationId, senderId e content', () => {
    const error = new MessageModel({}).validateSync();

    expect(error?.errors.conversationId).toBeDefined();
    expect(error?.errors.senderId).toBeDefined();
    expect(error?.errors.content).toBeDefined();
  });

  it('deve rejeitar tipo de conteúdo desconhecido e texto acima de 10.000 caracteres', () => {
    const invalidType = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'image', text: 'x' },
    }).validateSync();
    const tooLong = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'a'.repeat(10_001) },
    }).validateSync();

    expect(invalidType?.errors['content.type']).toBeDefined();
    expect(tooLong?.errors['content.text']).toBeDefined();
  });
});
