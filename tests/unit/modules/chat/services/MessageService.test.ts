jest.mock('@/modules/chat/repositories', () => ({
  conversationRepository: {},
  participantRepository: {},
  messageRepository: {},
}));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import {
  ConversationBlockedException,
  ConversationNotFoundException,
  InvalidMentionsException,
  MessageNotFoundException,
  NotMessageAuthorException,
} from '@/modules/chat/errors';
import type {
  IConversationRepository,
  IMessageRepository,
  IParticipantRepository,
} from '@/modules/chat/interfaces';
import { MessageService, messageService } from '@/modules/chat/services/MessageService';
import type {
  ConversationAttributes,
  MessageRecord,
  ParticipantAttributes,
} from '@/modules/chat/types';
import { ChatEvents } from '@/shared/types';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MESSAGE_ID = '65f000000000000000000002';
const REPLY_ID = '65f000000000000000000001';
const CREATED_AT = new Date('2026-09-24T10:00:00.000Z');
const META = { ip: '127.0.0.1', device: 'jest' };

function conversation(overrides: Partial<ConversationAttributes> = {}): ConversationAttributes {
  return {
    id: CONVERSATION_ID,
    type: 'direct',
    name: null,
    avatarUrl: null,
    createdBy: USER_A,
    directKey: `${USER_A}:${USER_B}`,
    lastMessageAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function participant(userId: string): ParticipantAttributes {
  return {
    id: `p-${userId}`,
    conversationId: CONVERSATION_ID,
    userId,
    role: 'member',
    joinedAt: CREATED_AT,
    lastReadAt: null,
    isMuted: false,
    archivedAt: null,
  };
}

function record(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: USER_A,
    content: { type: 'text', text: 'olá' },
    replyTo: null,
    mentions: [],
    metadata: META,
    deletedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('MessageService', () => {
  let messages: jest.Mocked<IMessageRepository>;
  let conversations: jest.Mocked<IConversationRepository>;
  let participants: jest.Mocked<IParticipantRepository>;
  let contacts: { isBlockedByEither: jest.Mock };
  let events: { publish: jest.Mock };
  let service: MessageService;

  beforeEach(() => {
    messages = {
      create: jest.fn(),
      findById: jest.fn(),
      findByConversation: jest.fn(),
      softDelete: jest.fn(),
    };
    conversations = {
      findById: jest.fn(),
      findByDirectKey: jest.fn(),
      createDirect: jest.fn(),
      createGroup: jest.fn(),
      listForUser: jest.fn(),
      rename: jest.fn(),
      touchLastMessageAt: jest.fn(),
      delete: jest.fn(),
    };
    participants = {
      find: jest.fn(),
      listByConversation: jest.fn(),
      listByConversations: jest.fn(),
      listConversationIdsByUser: jest.fn(),
      addMembers: jest.fn(),
      remove: jest.fn(),
      setRole: jest.fn(),
      setArchivedAt: jest.fn(),
    };
    contacts = { isBlockedByEither: jest.fn().mockResolvedValue(false) };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new MessageService(messages, conversations, participants, contacts, events);
  });

  it('deve exportar a instância padrão', () => {
    expect(messageService).toBeInstanceOf(MessageService);
  });

  describe('send', () => {
    beforeEach(() => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);
      conversations.findById.mockResolvedValue(conversation());
    });

    it('deve persistir, atualizar last_message_at e publicar MESSAGE_SENT', async () => {
      messages.create.mockResolvedValue(record({ content: { type: 'text', text: 'olá' } }));

      const result = await service.send(USER_A, CONVERSATION_ID, { text: '  olá  ' }, META);

      expect(messages.create).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        senderId: USER_A,
        content: { type: 'text', text: 'olá' },
        replyTo: null,
        mentions: [],
        metadata: META,
      });
      expect(conversations.touchLastMessageAt).toHaveBeenCalledWith(CONVERSATION_ID, CREATED_AT);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.MESSAGE_SENT, {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        conversationType: 'direct',
        senderId: USER_A,
        text: 'olá',
        mentions: [],
        replyTo: null,
        createdAt: CREATED_AT,
        participantIds: [USER_A, USER_B],
      });
      expect(result).toEqual({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        senderId: USER_A,
        content: { type: 'text', text: 'olá' },
        replyTo: null,
        mentions: [],
        deletedAt: null,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      expect(result).not.toHaveProperty('metadata');
    });

    it('deve responder 404 quando o remetente não participa', async () => {
      await expect(service.send(USER_C, CONVERSATION_ID, { text: 'oi' }, META)).rejects.toThrow(
        ConversationNotFoundException
      );
      expect(messages.create).not.toHaveBeenCalled();
    });

    it('deve responder 404 quando a conversa sumiu', async () => {
      conversations.findById.mockResolvedValue(null);

      await expect(service.send(USER_A, CONVERSATION_ID, { text: 'oi' }, META)).rejects.toThrow(
        ConversationNotFoundException
      );
    });

    it('deve responder 403 em direct com bloqueio em qualquer sentido', async () => {
      contacts.isBlockedByEither.mockResolvedValue(true);

      await expect(service.send(USER_A, CONVERSATION_ID, { text: 'oi' }, META)).rejects.toThrow(
        ConversationBlockedException
      );
      expect(contacts.isBlockedByEither).toHaveBeenCalledWith(USER_A, USER_B);
      expect(messages.create).not.toHaveBeenCalled();
    });

    it('não deve consultar bloqueio em grupo', async () => {
      conversations.findById.mockResolvedValue(conversation({ type: 'group', name: 'Time' }));
      messages.create.mockResolvedValue(record());

      await service.send(USER_A, CONVERSATION_ID, { text: 'oi' }, META);

      expect(contacts.isBlockedByEither).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(
        ChatEvents.MESSAGE_SENT,
        expect.objectContaining({ conversationType: 'group' })
      );
    });

    it('não deve consultar bloqueio em direct sem o outro participante', async () => {
      participants.listByConversation.mockResolvedValue([participant(USER_A)]);
      messages.create.mockResolvedValue(record());

      await service.send(USER_A, CONVERSATION_ID, { text: 'oi' }, META);

      expect(contacts.isBlockedByEither).not.toHaveBeenCalled();
    });

    it('deve aceitar replyTo da mesma conversa', async () => {
      messages.findById.mockResolvedValue(record({ id: REPLY_ID }));
      messages.create.mockResolvedValue(record({ replyTo: REPLY_ID }));

      const result = await service.send(
        USER_A,
        CONVERSATION_ID,
        { text: 'resposta', replyTo: REPLY_ID },
        META
      );

      expect(messages.findById).toHaveBeenCalledWith(REPLY_ID);
      expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ replyTo: REPLY_ID }));
      expect(result.replyTo).toBe(REPLY_ID);
    });

    it('deve responder 404 para replyTo inexistente ou de outra conversa', async () => {
      messages.findById.mockResolvedValueOnce(null);
      messages.findById.mockResolvedValueOnce(record({ conversationId: OTHER_CONVERSATION_ID }));

      await expect(
        service.send(USER_A, CONVERSATION_ID, { text: 'x', replyTo: REPLY_ID }, META)
      ).rejects.toThrow(MessageNotFoundException);
      await expect(
        service.send(USER_A, CONVERSATION_ID, { text: 'x', replyTo: REPLY_ID }, META)
      ).rejects.toThrow('Mensagem respondida não encontrada');
    });

    it('deve deduplicar mentions de participantes', async () => {
      messages.create.mockResolvedValue(record({ mentions: [USER_B] }));

      await service.send(USER_A, CONVERSATION_ID, { text: 'oi', mentions: [USER_B, USER_B] }, META);

      expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ mentions: [USER_B] }));
    });

    it('deve responder 400 para mention de não participante', async () => {
      await expect(
        service.send(USER_A, CONVERSATION_ID, { text: 'oi', mentions: [USER_C] }, META)
      ).rejects.toThrow(InvalidMentionsException);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_A));
    });

    it('deve responder 404 para não participante', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.list(USER_C, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });

    it('primeira página com 50 por padrão e nextCursor nulo quando não veio cheia', async () => {
      messages.findByConversation.mockResolvedValue([record()]);

      const result = await service.list(USER_A, CONVERSATION_ID);

      expect(messages.findByConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
        limit: 50,
        before: undefined,
      });
      expect(result.nextCursor).toBeNull();
      expect(result.messages).toHaveLength(1);
    });

    it('página cheia devolve nextCursor = id da última mensagem', async () => {
      messages.findByConversation.mockResolvedValue([
        record({ id: '65f000000000000000000003' }),
        record({ id: '65f000000000000000000002' }),
      ]);

      const result = await service.list(USER_A, CONVERSATION_ID, { limit: 2 });

      expect(result.nextCursor).toBe('65f000000000000000000002');
    });

    it('deve limitar a página a 50', async () => {
      messages.findByConversation.mockResolvedValue([]);

      await service.list(USER_A, CONVERSATION_ID, { limit: 500 });

      expect(messages.findByConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
        limit: 50,
        before: undefined,
      });
    });

    it('deve converter o cursor before em createdAt/_id', async () => {
      messages.findById.mockResolvedValue(record({ id: MESSAGE_ID }));
      messages.findByConversation.mockResolvedValue([]);

      await service.list(USER_A, CONVERSATION_ID, { limit: 2, before: MESSAGE_ID });

      expect(messages.findByConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
        limit: 2,
        before: { createdAt: CREATED_AT, id: MESSAGE_ID },
      });
    });

    it('deve responder 404 para cursor inexistente ou de outra conversa', async () => {
      messages.findById.mockResolvedValueOnce(null);
      messages.findById.mockResolvedValueOnce(record({ conversationId: OTHER_CONVERSATION_ID }));

      await expect(service.list(USER_A, CONVERSATION_ID, { before: MESSAGE_ID })).rejects.toThrow(
        MessageNotFoundException
      );
      await expect(service.list(USER_A, CONVERSATION_ID, { before: MESSAGE_ID })).rejects.toThrow(
        MessageNotFoundException
      );
    });

    it('mensagens apagadas voltam como tombstone', async () => {
      const deletedAt = new Date('2026-09-24T11:00:00.000Z');
      messages.findByConversation.mockResolvedValue([
        record({ deletedAt, mentions: [USER_B], replyTo: REPLY_ID }),
      ]);

      const result = await service.list(USER_A, CONVERSATION_ID);

      expect(result.messages[0]).toEqual(
        expect.objectContaining({
          id: MESSAGE_ID,
          content: null,
          mentions: [],
          replyTo: REPLY_ID,
          deletedAt,
        })
      );
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_A));
    });

    it('deve fazer soft delete e publicar MESSAGE_DELETED', async () => {
      messages.findById.mockResolvedValue(record());
      messages.softDelete.mockResolvedValue(true);

      await service.delete(USER_A, CONVERSATION_ID, MESSAGE_ID);

      expect(messages.softDelete).toHaveBeenCalledWith(MESSAGE_ID, expect.any(Date));
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.MESSAGE_DELETED, {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedBy: USER_A,
      });
    });

    it('apagar de novo é idempotente e não publica', async () => {
      messages.findById.mockResolvedValue(record({ deletedAt: CREATED_AT }));
      messages.softDelete.mockResolvedValue(false);

      await expect(service.delete(USER_A, CONVERSATION_ID, MESSAGE_ID)).resolves.toBeUndefined();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('deve responder 403 para quem não é o autor', async () => {
      participants.find.mockResolvedValue(participant(USER_B));
      messages.findById.mockResolvedValue(record());

      await expect(service.delete(USER_B, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        NotMessageAuthorException
      );
      expect(messages.softDelete).not.toHaveBeenCalled();
    });

    it('deve responder 404 para mensagem inexistente ou de outra conversa', async () => {
      messages.findById.mockResolvedValueOnce(null);
      messages.findById.mockResolvedValueOnce(record({ conversationId: OTHER_CONVERSATION_ID }));

      await expect(service.delete(USER_A, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        MessageNotFoundException
      );
      await expect(service.delete(USER_A, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        MessageNotFoundException
      );
    });

    it('deve responder 404 para não participante', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.delete(USER_C, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });
  });
});
