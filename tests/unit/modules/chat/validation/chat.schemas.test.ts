import {
  addMembersSchema,
  conversationIdParamSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  markReadSchema,
  memberParamSchema,
  messageParamSchema,
  renameConversationSchema,
  sendMessageSchema,
} from '@/modules/chat/validation';

const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';

describe('chat.schemas', () => {
  describe('params', () => {
    it('conversationIdParamSchema aceita UUID v4 e normaliza para minúsculas', () => {
      const parsed = conversationIdParamSchema.parse({ id: CONVERSATION_ID.toUpperCase() });
      expect(parsed.id).toBe(CONVERSATION_ID);
      expect(conversationIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    });

    it('memberParamSchema exige id e userId UUID', () => {
      expect(memberParamSchema.safeParse({ id: CONVERSATION_ID, userId: USER_A }).success).toBe(
        true
      );
      expect(memberParamSchema.safeParse({ id: CONVERSATION_ID, userId: 'x' }).success).toBe(false);
    });

    it('messageParamSchema exige messageId ObjectId (24 hex)', () => {
      expect(
        messageParamSchema.safeParse({ id: CONVERSATION_ID, messageId: MESSAGE_ID }).success
      ).toBe(true);
      expect(
        messageParamSchema.safeParse({ id: CONVERSATION_ID, messageId: 'not-an-id' }).success
      ).toBe(false);
    });
  });

  describe('createDirectConversationSchema', () => {
    it('aceita userId UUID', () => {
      expect(createDirectConversationSchema.parse({ userId: USER_A })).toEqual({ userId: USER_A });
    });

    it('rejeita userId ausente ou inválido', () => {
      expect(createDirectConversationSchema.safeParse({}).success).toBe(false);
      expect(createDirectConversationSchema.safeParse({ userId: '123' }).success).toBe(false);
    });
  });

  describe('createGroupConversationSchema / renameConversationSchema', () => {
    it('aceita nome com trim e participantes', () => {
      expect(
        createGroupConversationSchema.parse({ name: '  Time  ', participantIds: [USER_A] })
      ).toEqual({ name: 'Time', participantIds: [USER_A] });
    });

    it('rejeita nome vazio (após trim) ou acima de 100 caracteres', () => {
      expect(renameConversationSchema.safeParse({ name: '   ' }).success).toBe(false);
      expect(renameConversationSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
      expect(renameConversationSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true);
    });

    it('rejeita lista de participantes vazia, com id inválido ou acima de 256', () => {
      expect(
        createGroupConversationSchema.safeParse({ name: 'T', participantIds: [] }).success
      ).toBe(false);
      expect(
        createGroupConversationSchema.safeParse({ name: 'T', participantIds: ['x'] }).success
      ).toBe(false);
      expect(
        createGroupConversationSchema.safeParse({
          name: 'T',
          participantIds: Array.from({ length: 257 }, () => USER_A),
        }).success
      ).toBe(false);
    });
  });

  describe('addMembersSchema', () => {
    it('exige ao menos um userId UUID', () => {
      expect(addMembersSchema.safeParse({ userIds: [USER_A] }).success).toBe(true);
      expect(addMembersSchema.safeParse({ userIds: [] }).success).toBe(false);
    });
  });

  describe('listConversationsQuerySchema', () => {
    it('aplica defaults', () => {
      expect(listConversationsQuerySchema.parse({})).toEqual({
        archived: false,
        limit: 20,
        offset: 0,
      });
    });

    it('converte strings da query', () => {
      expect(
        listConversationsQuerySchema.parse({ archived: 'true', limit: '5', offset: '10' })
      ).toEqual({ archived: true, limit: 5, offset: 10 });
      expect(listConversationsQuerySchema.parse({ archived: 'false' }).archived).toBe(false);
    });

    it('rejeita valores fora do intervalo', () => {
      expect(listConversationsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
      expect(listConversationsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
      expect(listConversationsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
      expect(listConversationsQuerySchema.safeParse({ archived: 'yes' }).success).toBe(false);
    });
  });

  describe('listMessagesQuerySchema', () => {
    it('usa 50 por padrão e aceita cursor before', () => {
      expect(listMessagesQuerySchema.parse({})).toEqual({ limit: 50 });
      expect(listMessagesQuerySchema.parse({ limit: '2', before: MESSAGE_ID })).toEqual({
        limit: 2,
        before: MESSAGE_ID,
      });
    });

    it('rejeita limit acima de 50 e cursor inválido', () => {
      expect(listMessagesQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
      expect(listMessagesQuerySchema.safeParse({ before: 'abc' }).success).toBe(false);
    });
  });

  describe('markReadSchema', () => {
    it('exige messageId ObjectId (24 hex)', () => {
      expect(markReadSchema.parse({ messageId: MESSAGE_ID })).toEqual({ messageId: MESSAGE_ID });
      expect(markReadSchema.safeParse({ messageId: 'x' }).success).toBe(false);
      expect(markReadSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('sendMessageSchema', () => {
    it('faz trim do texto e aceita replyTo/mentions', () => {
      expect(
        sendMessageSchema.parse({ text: '  oi  ', replyTo: MESSAGE_ID, mentions: [USER_A] })
      ).toEqual({ text: 'oi', replyTo: MESSAGE_ID, mentions: [USER_A] });
    });

    it('rejeita texto vazio, só espaços ou acima de 10.000 caracteres', () => {
      expect(sendMessageSchema.safeParse({ text: '' }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ text: '   ' }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ text: 'a'.repeat(10_001) }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ text: 'a'.repeat(10_000) }).success).toBe(true);
    });

    it('rejeita replyTo e mentions inválidos', () => {
      expect(sendMessageSchema.safeParse({ text: 'oi', replyTo: 'x' }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ text: 'oi', mentions: ['x'] }).success).toBe(false);
    });

    it('aceita clientMessageId UUID opcional (normalizado em minúsculas) e rejeita inválido', () => {
      const clientMessageId = '33333333-3333-4333-8333-333333333333';

      expect(
        sendMessageSchema.parse({ text: 'oi', clientMessageId: clientMessageId.toUpperCase() })
      ).toEqual({ text: 'oi', clientMessageId });
      expect(sendMessageSchema.parse({ text: 'oi' })).not.toHaveProperty('clientMessageId');
      expect(sendMessageSchema.safeParse({ text: 'oi', clientMessageId: 'x' }).success).toBe(false);
    });
  });
});
