import type {
  AckResponse,
  MessageStatusPayload,
  ServerToClientEvents,
  SocketData,
} from '@/modules/realtime/types';

describe('realtime types', () => {
  it('descrevem o ack e os payloads servidor → cliente', () => {
    const ok: AckResponse<null> = { ok: true, data: null };
    const failure: AckResponse<null> = {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Conversa não encontrada', statusCode: 404 },
    };
    const status: MessageStatusPayload = {
      type: 'read',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '22222222-2222-4222-8222-222222222222',
      upToMessageId: '65f000000000000000000001',
      at: new Date(),
    };
    const data: SocketData = { userId: 'u1', ip: null, device: null, tokenExpiresAt: null };
    const indicator: Parameters<ServerToClientEvents['typing:indicator']>[0] = {
      conversationId: 'c1',
      userId: 'u1',
      isTyping: true,
    };

    expect([ok.ok, failure.ok, status.type, data.userId, indicator.isTyping]).toEqual([
      true,
      false,
      'read',
      'u1',
      true,
    ]);
  });
});
