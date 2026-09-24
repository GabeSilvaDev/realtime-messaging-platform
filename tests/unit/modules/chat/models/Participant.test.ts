import { Conversation, Participant } from '@/modules/chat/models';

describe('Participant model', () => {
  it('deve usar a tabela participants sem timestamps automáticos', () => {
    const attributes = Participant.getAttributes();

    expect(Participant.getTableName()).toBe('participants');
    expect(Participant.options.timestamps).toBe(false);
    expect(attributes.conversationId!.field).toBe('conversation_id');
    expect(attributes.userId!.field).toBe('user_id');
    expect(attributes.role!.defaultValue).toBe('member');
    expect(attributes.isMuted!.defaultValue).toBe(false);
    expect(attributes.archivedAt!.field).toBe('archived_at');
    expect(attributes.lastReadAt!.field).toBe('last_read_at');
  });

  it('deve pertencer a Conversation via alias conversation', () => {
    const association = Participant.associations.conversation;

    expect(association).toBeDefined();
    expect(association!.target).toBe(Conversation);
    expect(association!.foreignKey).toBe('conversationId');
  });

  it('toJSON deve retornar os atributos do participante', () => {
    const joinedAt = new Date('2026-09-24T00:00:00.000Z');
    const participant = Participant.build(
      {
        conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: '11111111-1111-4111-8111-111111111111',
        role: 'admin',
        joinedAt,
      },
      { isNewRecord: false }
    );
    participant.setDataValue('id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    participant.setDataValue('lastReadAt', null);
    participant.setDataValue('isMuted', false);
    participant.setDataValue('archivedAt', null);

    expect(participant.toJSON()).toEqual({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
      joinedAt,
      lastReadAt: null,
      isMuted: false,
      archivedAt: null,
    });
  });
});
