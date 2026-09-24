import { Conversation } from '@/modules/chat/models';

describe('Conversation model', () => {
  it('deve usar a tabela conversations com colunas snake_case', () => {
    const attributes = Conversation.getAttributes();

    expect(Conversation.getTableName()).toBe('conversations');
    expect(attributes.avatarUrl!.field).toBe('avatar_url');
    expect(attributes.createdBy!.field).toBe('created_by');
    expect(attributes.directKey!.field).toBe('direct_key');
    expect(attributes.directKey!.unique).toBe(true);
    expect(attributes.lastMessageAt!.field).toBe('last_message_at');
    expect(attributes.type!.allowNull).toBe(false);
  });

  it('toJSON deve retornar os atributos da conversa', () => {
    const date = new Date('2026-09-24T00:00:00.000Z');
    const conversation = Conversation.build(
      {
        type: 'direct',
        name: null,
        avatarUrl: null,
        createdBy: '11111111-1111-4111-8111-111111111111',
        directKey: '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222',
        lastMessageAt: null,
      },
      { isNewRecord: false }
    );
    conversation.setDataValue('id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    conversation.setDataValue('createdAt', date);
    conversation.setDataValue('updatedAt', date);

    expect(conversation.toJSON()).toEqual({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'direct',
      name: null,
      avatarUrl: null,
      createdBy: '11111111-1111-4111-8111-111111111111',
      directKey: '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222',
      lastMessageAt: null,
      createdAt: date,
      updatedAt: date,
    });
  });
});
