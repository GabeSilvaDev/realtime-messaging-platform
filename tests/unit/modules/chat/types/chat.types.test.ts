import * as chatTypes from '@/modules/chat/types';
import type {
  ConversationAttributes,
  ConversationDTO,
  MessageDTO,
  MessageRecord,
  PaginatedMessages,
  ParticipantAttributes,
} from '@/modules/chat/types';

describe('chat types', () => {
  it('deve carregar o barrel de tipos', () => {
    expect(chatTypes).toBeDefined();
  });

  it('deve aceitar uma conversa com participante e DTO', () => {
    const now = new Date();
    const conversation: ConversationAttributes = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'group',
      name: 'Time',
      avatarUrl: null,
      createdBy: '11111111-1111-4111-8111-111111111111',
      directKey: null,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const membership: ParticipantAttributes = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      conversationId: conversation.id,
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
      joinedAt: now,
      lastReadAt: null,
      isMuted: false,
      archivedAt: null,
    };
    const dto: ConversationDTO = {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      avatarUrl: null,
      createdBy: conversation.createdBy,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
      participants: [
        {
          id: membership.userId,
          username: 'ana',
          displayName: null,
          avatarUrl: null,
          role: 'admin',
        },
      ],
      membership: { role: membership.role, isMuted: false, archivedAt: null },
    };

    expect(dto.participants[0]!.role).toBe('admin');
  });

  it('deve aceitar mensagem, tombstone e página', () => {
    const now = new Date();
    const record: MessageRecord = {
      id: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      senderId: '11111111-1111-4111-8111-111111111111',
      content: { type: 'text', text: 'oi' },
      replyTo: null,
      mentions: [],
      metadata: { ip: '127.0.0.1', device: 'jest' },
      clientMessageId: null,
      deliveredTo: [],
      readBy: [],
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const tombstone: MessageDTO = { ...record, content: null, deletedAt: now };
    const page: PaginatedMessages = { messages: [tombstone], nextCursor: null };

    expect(page.messages[0]!.content).toBeNull();
  });
});
