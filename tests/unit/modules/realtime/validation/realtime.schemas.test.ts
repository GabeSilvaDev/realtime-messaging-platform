import {
  messageSendPayloadSchema,
  messageStatusPayloadSchema,
  typingPayloadSchema,
} from '@/modules/realtime/validation';

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CLIENT_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

describe('realtime schemas', () => {
  describe('messageSendPayloadSchema (reusa sendMessageSchema do chat)', () => {
    it('aceita o payload completo, normaliza UUIDs e faz trim do texto', () => {
      const parsed = messageSendPayloadSchema.parse({
        conversationId: CONVERSATION_ID.toUpperCase(),
        text: '  oi  ',
        replyTo: MESSAGE_ID,
        mentions: [USER_B],
        clientMessageId: CLIENT_MESSAGE_ID,
      });

      expect(parsed).toEqual({
        conversationId: CONVERSATION_ID,
        text: 'oi',
        replyTo: MESSAGE_ID,
        mentions: [USER_B],
        clientMessageId: CLIENT_MESSAGE_ID,
      });
    });

    it('rejeita conversa ausente/inválida, texto vazio e payload que não é objeto', () => {
      expect(messageSendPayloadSchema.safeParse({ text: 'oi' }).success).toBe(false);
      expect(messageSendPayloadSchema.safeParse({ conversationId: 'x', text: 'oi' }).success).toBe(
        false
      );
      expect(
        messageSendPayloadSchema.safeParse({ conversationId: CONVERSATION_ID, text: '  ' }).success
      ).toBe(false);
      expect(messageSendPayloadSchema.safeParse('oi').success).toBe(false);
      expect(messageSendPayloadSchema.safeParse(undefined).success).toBe(false);
    });
  });

  describe('messageStatusPayloadSchema', () => {
    it('exige conversationId UUID e messageId ObjectId', () => {
      expect(
        messageStatusPayloadSchema.parse({ conversationId: CONVERSATION_ID, messageId: MESSAGE_ID })
      ).toEqual({ conversationId: CONVERSATION_ID, messageId: MESSAGE_ID });
      expect(
        messageStatusPayloadSchema.safeParse({ conversationId: CONVERSATION_ID, messageId: 'x' })
          .success
      ).toBe(false);
      expect(messageStatusPayloadSchema.safeParse({ messageId: MESSAGE_ID }).success).toBe(false);
    });
  });

  describe('typingPayloadSchema', () => {
    it('exige conversationId UUID', () => {
      expect(typingPayloadSchema.parse({ conversationId: CONVERSATION_ID })).toEqual({
        conversationId: CONVERSATION_ID,
      });
      expect(typingPayloadSchema.safeParse({ conversationId: 'x' }).success).toBe(false);
      expect(typingPayloadSchema.safeParse(null).success).toBe(false);
    });
  });
});
